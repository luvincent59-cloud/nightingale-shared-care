import {env} from 'cloudflare:workers';
import type {Actor} from './auth';
import {teamRoles} from './importance';
export type Claim={key:string;value:string;quote:string;start:number;end:number};
export type Conflict={id:string;clinician_entry_id:string;other_entry_id:string;claim_key:string;clinician_value:string;other_value:string;reason:string;provenance_json:string;status:string;created_at:string;reviewed_by:string|null;review_note:string|null};
type Entry={id:string;owner_role:string;raw_ai:number;content:string;created_at:string};
// Narrow, inspectable discrepancy detector. Temporal changes are flagged for review, not declared errors.
export function extractClaims(text:string):Claim[]{
 const rules:[string,string,RegExp][]=[
  ['allergy:penicillin','denied',/\b(?:no|denies) (?:known )?(?:penicillin allergy|allergy to penicillin)\b|(?:无|否认|没有)青霉素过敏/gi],
  ['allergy:penicillin','reported',/\b(?:allergic to penicillin|penicillin allergy present)\b|(?:对青霉素过敏|青霉素过敏阳性)/gi],
 ];
 for(const [en,zh] of [['aspirin','阿司匹林'],['metformin','二甲双胍'],['insulin','胰岛素']]){
  rules.push([`medication:${en}`,'stopped',new RegExp(`\\b(?:stopped|discontinued|not taking) ${en}\\b|(?:停用|停止服用|未服用)${zh}`,'gi')]);
  rules.push([`medication:${en}`,'taking',new RegExp(`\\b(?:currently taking|continue taking) ${en}\\b|(?:正在服用|继续服用)${zh}`,'gi')]);
 }
 return rules.flatMap(([key,value,re])=>Array.from(text.matchAll(re),m=>({key,value,quote:m[0],start:m.index!,end:m.index!+m[0].length}))).filter(claim=>{
  const prefix=text.slice(Math.max(0,claim.start-40),claim.start).split(/[.。!?！？\n]/).at(-1)??'';
  return !/\b(?:not|no|denies|possible|possibly|maybe|if)\s*$/i.test(prefix)&&!/(?:不|未|否认|可能|没有)$/.test(prefix);
 });
}
const pointer=(entry:Entry,claim?:Claim)=>({entry_id:entry.id,source_id:entry.id,field:'content',version:1,...(claim?{start:claim.start,end:claim.end,quote:claim.quote}:{})});
function insertConflict(actor:Actor,doctor:Entry,other:Entry,key:string,doctorValue:string,otherValue:string,reason:string,doctorClaim?:Claim,otherClaim?:Claim){
 const id=`conflict:${doctor.id}:${other.id}:${key}`;
 return env.DB.prepare("INSERT OR IGNORE INTO record_conflicts (id,clinic_id,patient_id,clinician_entry_id,other_entry_id,claim_key,clinician_value,other_value,reason,provenance_json,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,actor.clinicId,actor.patientId??'patient-1',doctor.id,other.id,key,doctorValue,otherValue,reason,JSON.stringify({clinician:pointer(doctor,doctorClaim),other:pointer(other,otherClaim)}),'open',new Date().toISOString());
}
export async function detectConflicts(actor:Actor){
 const {results}=await env.DB.prepare('SELECT id,owner_role,raw_ai,content,created_at FROM care_entries WHERE clinic_id=? AND patient_id=? ORDER BY created_at DESC,id DESC').bind(actor.clinicId,actor.patientId??'patient-1').all<Entry>();
 const authoritative=new Map<string,{entry:Entry;claim:Claim}>();
 for(const entry of results.filter(e=>e.owner_role==='clinician'&&!e.raw_ai))for(const claim of extractClaims(entry.content))if(!authoritative.has(claim.key))authoritative.set(claim.key,{entry,claim});
 const ops=[];
 for(const [key,current] of authoritative)ops.push(env.DB.prepare("UPDATE record_conflicts SET status='superseded' WHERE clinic_id=? AND patient_id=? AND claim_key=? AND clinician_entry_id<>? AND status IN ('open','clinician_confirmed')").bind(actor.clinicId,actor.patientId??'patient-1',key,current.entry.id));
 for(const entry of results.filter(e=>e.owner_role==='patient'||e.raw_ai))for(const claim of extractClaims(entry.content)){
  const preferred=authoritative.get(claim.key);if(preferred&&preferred.claim.value!==claim.value)ops.push(insertConflict(actor,preferred.entry,entry,claim.key,preferred.claim.value,claim.value,'Possible discrepancy or change over time. Clinician record takes precedence pending human confirmation.',preferred.claim,claim));
 }
 if(ops.length)await env.DB.batch(ops);
}
export async function conflictData(actor:Actor){
 if(!teamRoles.includes(actor.role))return [];
 const rows=await env.DB.prepare('SELECT * FROM record_conflicts WHERE clinic_id=? AND patient_id=? ORDER BY created_at DESC LIMIT 100').bind(actor.clinicId,actor.patientId??'patient-1').all<Conflict>();
 return rows.results;
}
export async function flagConflict(actor:Actor,doctorId:string,otherId:string,reason:string){
 if(!teamRoles.includes(actor.role))return {status:403,error:'Care-team role required'};
 if(reason.trim().length<8)return {status:400,error:'Describe the discrepancy (at least 8 characters)'};
 const {results}=await env.DB.prepare('SELECT id,owner_role,raw_ai,content,created_at FROM care_entries WHERE clinic_id=? AND patient_id=? AND id IN (?,?)').bind(actor.clinicId,'patient-1',doctorId,otherId).all<Entry>();
 const doctor=results.find(e=>e.id===doctorId&&e.owner_role==='clinician'&&!e.raw_ai),other=results.find(e=>e.id===otherId&&(e.owner_role==='patient'||e.raw_ai));
 if(!doctor||!other)return {status:400,error:'Select a clinician note and an AI or patient note in this patient record'};
 const result=await insertConflict(actor,doctor,other,'manual','Clinician record','Conflicting source',reason.trim().slice(0,1000)).run();
 if(result.meta.changes)await env.DB.prepare('INSERT INTO audit_events (clinic_id,actor_role,actor_id,action,resource_id,metadata,created_at) VALUES (?,?,?,?,?,?,?)').bind(actor.clinicId,actor.role,actor.id,'conflict.flagged',`conflict:${doctor.id}:${other.id}:manual`,JSON.stringify({clinician_entry_id:doctor.id,other_entry_id:other.id}),new Date().toISOString()).run();
 return {status:201,ok:true};
}
export async function confirmConflict(actor:Actor,id:string,reason:string){
 if(actor.role!=='clinician')return {status:403,error:'Only a clinician can confirm a conflict'};
 if(reason.trim().length<8)return {status:400,error:'Record the human review reason'};
 const time=new Date().toISOString();
 const result=await env.DB.batch([
  env.DB.prepare("INSERT INTO audit_events (clinic_id,actor_role,actor_id,action,resource_id,metadata,created_at) SELECT clinic_id,?,?,?,id,?,? FROM record_conflicts WHERE id=? AND clinic_id=? AND patient_id=? AND status='open'").bind(actor.role,actor.id,'conflict.clinician_confirmed',JSON.stringify({status:"clinician_confirmed"}),time,id,actor.clinicId,'patient-1'),
  env.DB.prepare("UPDATE record_conflicts SET status='clinician_confirmed',reviewed_by=?,review_note=?,reviewed_at=? WHERE id=? AND clinic_id=? AND patient_id=? AND status='open'").bind(actor.id,reason.trim().slice(0,1000),time,id,actor.clinicId,'patient-1'),
 ]);
 return result[1].meta.changes?{status:200,ok:true}:{status:409,error:'Conflict missing or already reviewed'};
}
