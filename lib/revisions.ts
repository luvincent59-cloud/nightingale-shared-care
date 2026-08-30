import {env} from 'cloudflare:workers';
import type {Actor} from './auth';
export type VersionedEntry={id:string;clinic_id:string;patient_id:string;owner_role:string;author_id:string;kind:string;title:string;content:string;patient_visible:number;raw_ai:number;version:number;created_at:string;updated_at:string|null};
export function canEditNote(actor:Actor,e:VersionedEntry){return actor.clinicId===e.clinic_id&&!e.raw_ai&&actor.role===e.owner_role&&['clinician','staff','nurse','patient'].includes(actor.role)&&(actor.role!=='patient'||e.author_id===actor.id&&e.patient_id===actor.patientId)}
export function baselineNote(id:string,clinic:string){return env.DB.prepare("INSERT OR IGNORE INTO note_versions (id,entry_id,clinic_id,patient_id,version,title,content,patient_visible,actor_id,action,created_at) SELECT id||':v'||version,id,clinic_id,patient_id,version,title,content,patient_visible,author_id,'baseline',COALESCE(updated_at,created_at) FROM care_entries WHERE id=? AND clinic_id=?").bind(id,clinic)}
export async function getEntry(actor:Actor,id:string){return env.DB.prepare('SELECT * FROM care_entries WHERE id=? AND clinic_id=? AND patient_id=?').bind(id,actor.clinicId,actor.patientId??'patient-1').first<VersionedEntry>()}
export async function noteHistory(actor:Actor,id:string){
 const e=await getEntry(actor,id);if(!e)return {status:404,error:'Entry not found'};
 if(actor.role==='patient'&&(e.raw_ai||!e.patient_visible))return {status:403,error:'Internal version history is not available'};
 await baselineNote(id,actor.clinicId).run();
 const {results}=await env.DB.prepare('SELECT * FROM note_versions WHERE entry_id=? AND clinic_id=?'+(actor.role==='patient'?' AND patient_visible=1':'')+' ORDER BY version DESC').bind(id,actor.clinicId).all();
 return {status:200,entry:e.id,currentVersion:e.version,canEdit:canEditNote(actor,e),versions:results};
}
export async function changeNote(actor:Actor,body:Record<string,unknown>){
 const id=String(body.entryId??''),e=await getEntry(actor,id);if(!e)return {status:404,error:'Entry not found'};
 if(!canEditNote(actor,e))return {status:403,error:'Only the owning role can edit this note; raw AI records are immutable'};
 const expected=Number(body.expectedVersion);if(!Number.isInteger(expected)||expected<1)return {status:400,error:'Expected version required'};
 let title=String(body.title??e.title).trim(),content=String(body.content??'').trim();let visible=body.patientVisible===undefined?e.patient_visible:Number(body.patientVisible===true);
 const reverting=body.action==='revert_note';
 if(reverting){const prior=await env.DB.prepare('SELECT title,content,patient_visible FROM note_versions WHERE entry_id=? AND clinic_id=? AND version=?').bind(id,actor.clinicId,Number(body.targetVersion)).first<{title:string;content:string;patient_visible:number}>();if(!prior)return {status:404,error:'Snapshot not found'};title=prior.title;content=prior.content;visible=prior.patient_visible}
 if(!title||title.length>160||!content||content.length>12000)return {status:400,error:'Title (1–160) and content (1–12000 characters) required'};
 if(actor.role==='patient')visible=1;
 const mutation=crypto.randomUUID(),time=new Date().toISOString(),action=reverting?'note.reverted':'note.edited';
 const ops=[baselineNote(id,actor.clinicId),
  env.DB.prepare('UPDATE care_entries SET title=?,content=?,patient_visible=?,version=version+1,updated_at=?,mutation_id=? WHERE id=? AND clinic_id=? AND patient_id=? AND owner_role=? AND raw_ai=0 AND version=?').bind(title,content,visible,time,mutation,id,actor.clinicId,e.patient_id,actor.role,expected),
  env.DB.prepare("INSERT INTO note_versions (id,entry_id,clinic_id,patient_id,version,title,content,patient_visible,actor_id,action,created_at) SELECT id||':v'||version,id,clinic_id,patient_id,version,title,content,patient_visible,?,?,? FROM care_entries WHERE id=? AND mutation_id=?").bind(actor.id,action,time,id,mutation),
  env.DB.prepare('DELETE FROM timeline_projections WHERE event_id=? AND clinic_id=? AND EXISTS(SELECT 1 FROM care_entries WHERE id=? AND mutation_id=?)').bind(id,actor.clinicId,id,mutation),
  env.DB.prepare("INSERT INTO timeline_projections (id,event_id,clinic_id,patient_id,audience_role,owner_role,author_id,kind,title,content,source,confidence,ai_generated,review_status,created_at) SELECT 'projection-patient-'||id,id,clinic_id,patient_id,'patient',owner_role,author_id,kind,title,content,source,confidence,CASE WHEN kind='voice_note' THEN 1 ELSE 0 END,'author_reviewed',created_at FROM care_entries WHERE id=? AND mutation_id=? AND patient_visible=1").bind(id,mutation),
  env.DB.prepare('INSERT INTO audit_events (clinic_id,actor_role,actor_id,action,resource_id,metadata,created_at) SELECT clinic_id,?,?,?,id,?,? FROM care_entries WHERE id=? AND mutation_id=?').bind(actor.role,actor.id,action,JSON.stringify({from_version:expected,to_version:expected+1,...(reverting?{target_version:Number(body.targetVersion)}:{})}),time,id,mutation),
  env.DB.prepare('INSERT INTO record_events (id,clinic_id,patient_id,entry_id,actor_id,actor_role,action,version,patient_visible,created_at) SELECT ?,clinic_id,patient_id,id,?,?,?,version,patient_visible,? FROM care_entries WHERE id=? AND mutation_id=?').bind(`event-${mutation}`,actor.id,actor.role,action,time,id,mutation),
 ];
 const results=await env.DB.batch(ops);
 return results[1].meta.changes?{status:200,ok:true,version:expected+1}:{status:409,error:'Another user changed this note. Your draft was not saved; reload and compare.',currentVersion:(await getEntry(actor,id))?.version};
}
export async function changePlan(actor:Actor,body:Record<string,unknown>){
 if(actor.role!=='clinician')return {status:403,error:'Only clinicians can edit the care plan'};
 const expected=Number(body.expectedVersion);if(!Number.isInteger(expected)||expected<1)return {status:400,error:'Expected version required'};
 let content=String(body.content??'').trim();const reverting=body.action==='revert_plan';
 if(reverting){const prior=await env.DB.prepare('SELECT content FROM plan_versions WHERE patient_id=? AND clinic_id=? AND version=? ORDER BY id DESC LIMIT 1').bind('patient-1',actor.clinicId,Number(body.targetVersion)).first<{content:string}>();if(!prior)return {status:404,error:'Version not found'};content=prior.content}
 if(!content||content.length>12000)return {status:400,error:'Plan content required, maximum 12,000 characters'};
 const mutation=crypto.randomUUID(),time=new Date().toISOString(),action=reverting?'plan.reverted':'plan.updated';
 const results=await env.DB.batch([
  env.DB.prepare('UPDATE care_plans SET content=?,version=version+1,updated_by=?,updated_at=?,mutation_id=? WHERE patient_id=? AND clinic_id=? AND version=?').bind(content,actor.id,time,mutation,'patient-1',actor.clinicId,expected),
  env.DB.prepare('INSERT INTO plan_versions (patient_id,clinic_id,version,content,actor_id,action,created_at) SELECT patient_id,clinic_id,version,content,?,?,? FROM care_plans WHERE patient_id=? AND clinic_id=? AND mutation_id=?').bind(actor.id,reverting?`reverted_from_v${Number(body.targetVersion)}`:'updated',time,'patient-1',actor.clinicId,mutation),
  env.DB.prepare('INSERT INTO audit_events (clinic_id,actor_role,actor_id,action,resource_id,metadata,created_at) SELECT clinic_id,?,?,?,patient_id,?,? FROM care_plans WHERE patient_id=? AND clinic_id=? AND mutation_id=?').bind(actor.role,actor.id,action,JSON.stringify({from_version:expected,to_version:expected+1,...(reverting?{target_version:Number(body.targetVersion)}:{})}),time,'patient-1',actor.clinicId,mutation),
  env.DB.prepare("INSERT INTO record_events (id,clinic_id,patient_id,entry_id,actor_id,actor_role,action,version,patient_visible,created_at) SELECT ?,clinic_id,patient_id,'care-plan',?,?,?,version,1,? FROM care_plans WHERE patient_id=? AND clinic_id=? AND mutation_id=?").bind(`event-${mutation}`,actor.id,actor.role,action,time,'patient-1',actor.clinicId,mutation),
 ]);
 return results[0].meta.changes?{status:200,ok:true,version:expected+1}:{status:409,error:'Version conflict. Reload before saving or reverting.'};
}
export async function changeComment(actor:Actor,body:Record<string,unknown>){
 if(!['staff','nurse','clinician'].includes(actor.role))return {status:403,error:'Internal comments are restricted'};
 const id=String(body.commentId??''),expected=Number(body.expectedVersion);if(!Number.isInteger(expected)||expected<1||typeof body.resolved!=='boolean')return {status:400,error:'Expected version and boolean state required'};
 const mutation=crypto.randomUUID(),time=new Date().toISOString();
 const result=await env.DB.batch([
  env.DB.prepare("INSERT OR IGNORE INTO comment_versions SELECT id||':v'||version,id,clinic_id,version,body,resolved,author_id,created_at FROM comments WHERE id=? AND clinic_id=?").bind(id,actor.clinicId),
  env.DB.prepare('UPDATE comments SET resolved=?,version=version+1,mutation_id=? WHERE id=? AND clinic_id=? AND version=?').bind(Number(body.resolved),mutation,id,actor.clinicId,expected),
  env.DB.prepare("INSERT INTO comment_versions SELECT id||':v'||version,id,clinic_id,version,body,resolved,?,? FROM comments WHERE id=? AND mutation_id=?").bind(actor.id,time,id,mutation),
  env.DB.prepare('INSERT INTO audit_events (clinic_id,actor_role,actor_id,action,resource_id,metadata,created_at) SELECT clinic_id,?,?,?,id,?,? FROM comments WHERE id=? AND mutation_id=?').bind(actor.role,actor.id,body.resolved?'comment.resolved':'comment.reopened',JSON.stringify({from_version:expected,to_version:expected+1}),time,id,mutation),
 ]);
 return result[1].meta.changes?{status:200,ok:true,version:expected+1}:{status:409,error:'Comment changed or was not found'};
}
