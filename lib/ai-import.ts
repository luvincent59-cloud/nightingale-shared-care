import {env} from 'cloudflare:workers';
import {actors,type Actor} from './auth';
import {prepareModelInput,fingerprint} from './privacy';
import {noteSuggestion} from './learning-store';
import type {TranscriptSource} from './transcripts';
const interactions={doctor:{kind:'ai_doctor_consult_summary',human:['dr-samuel-lee','maya-chen'],roles:['patient','clinician'],allowed:['clinician']},nurse:{kind:'ai_nurse_consult_summary',human:['mei-tan','maya-chen'],roles:['patient','nurse'],allowed:['clinician','nurse']},patient_ai:{kind:'ai_patient_session_summary',human:['maya-chen'],roles:['patient','ai'],allowed:['clinician','nurse','staff']}};
export async function prepareImport(actor:Actor,body:Record<string,unknown>){
 const interaction=String(body.interaction??'') as keyof typeof interactions,config=interactions[interaction];
 if(!config||!config.allowed.includes(actor.role))return {status:403,error:'This role cannot import that interaction type'};
 if(body.syntheticConsent!==true)return {status:400,error:'Only simulated data may be imported; confirm authorization'};
 const title=String(body.title??'').trim(),summary=String(body.summary??'').trim(),model=String(body.model??'external-unverified').trim(),messages=body.messages;
 if(!title||title.length>160||!summary||summary.length>12000||!Array.isArray(messages)||messages.length<2||messages.length>100||!/^[a-zA-Z0-9_.-]{1,80}$/.test(model))return {status:400,error:'Supply title, summary, model ID and 2–100 source messages'};
 if(messages.reduce((n,m)=>n+(typeof m?.text==='string'?m.text.length:0),0)>40000)return {status:400,error:'Combined source text cannot exceed 40,000 characters'};
 const names=actors.map(a=>a.name);let count=0;const clean=(text:string)=>{const r=prepareModelInput(text,names);count+=r.count;return r.text};
 const lines:TranscriptSource['lines']=[];const evidence=body.evidence;
 if(!Array.isArray(evidence)||!evidence.length||evidence.some(i=>!Number.isInteger(i)||i<0||i>=messages.length))return {status:400,error:'Select at least one valid evidence message index (zero-based)'};
 for(const m of messages){if(!m||typeof m!=='object'||!config.roles.includes(m.speaker)||typeof m.text!=='string'||!m.text.trim()||m.text.length>4000||typeof m.time!=='string'||!/^\d{2}:\d{2}(?::\d{2})?$/.test(m.time))return {status:400,error:'Each message needs an allowed speaker role, time and text'};lines.push({speaker:m.speaker,time:m.time,text:clean(m.text),match:evidence.includes(lines.length)})}
 if(!config.roles.every(role=>messages.some(m=>m.speaker===role)))return {status:400,error:'Both interaction participants must have a source message'};
 const preview={interaction,kind:config.kind,title:clean(title),summary:clean(summary),model,lines,humanParticipants:config.human,evidence:[...new Set(evidence as number[])],redactionCount:count,redactionVersion:'phi-rules-v1',origin:'Imported AI output · unverified model'};
 return {status:200,preview,previewHash:await fingerprint(preview)};
}
export async function importAiNote(actor:Actor,body:Record<string,unknown>){
 const prepared=await prepareImport(actor,body);if(!prepared.preview)return prepared;
 if(body.reviewedRedaction!==true||body.previewHash!==prepared.previewHash)return {status:400,error:'Review the current redacted preview before importing'};
 const p=prepared.preview,id=`entry-${crypto.randomUUID()}`,sourceId=`session-${crypto.randomUUID()}`,time=new Date().toISOString();
 const ops=[
  env.DB.prepare('INSERT INTO care_entries (id,clinic_id,patient_id,owner_role,author_id,kind,title,content,source,confidence,patient_visible,raw_ai,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,actor.clinicId,'patient-1','system','system',p.kind,p.title,p.summary,sourceId,'Imported AI output · clinician review required',0,1,time),
  env.DB.prepare('INSERT INTO consult_sources (id,entry_id,clinic_id,patient_id,interaction,model,participants_json,messages_json,evidence_json,redaction_count,checksum,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(sourceId,id,actor.clinicId,'patient-1',p.interaction,p.model,JSON.stringify(p.humanParticipants),JSON.stringify(p.lines),JSON.stringify(p.evidence),p.redactionCount,await fingerprint(p.lines),time),
  env.DB.prepare('INSERT INTO timeline_projections (id,event_id,clinic_id,patient_id,audience_role,owner_role,author_id,kind,title,content,source,confidence,ai_generated,review_status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(`projection-patient-${id}`,id,actor.clinicId,'patient-1','patient','system','system','patient_encounter_event','New conversation summary received','Your conversation has been added to the shared record. The care team will review it before sharing clinical conclusions.',sourceId,'System event · clinical summary pending',0,'care_team_review_pending',time),
  noteSuggestion({id,title:p.title,content:p.summary},actor,time),
  env.DB.prepare('INSERT INTO audit_events (clinic_id,actor_role,actor_id,action,resource_id,metadata,created_at) VALUES (?,?,?,?,?,?,?)').bind(actor.clinicId,actor.role,actor.id,'ai_note.imported',id,JSON.stringify({kind:p.kind,model:p.model,source_id:sourceId,redaction_count:p.redactionCount}),time),
 ];
 await env.DB.batch(ops);return {status:201,ok:true,id,eventId:id,sourceId};
}
export async function importedMetadata(actor:Actor){
 const rows=await env.DB.prepare('SELECT entry_id,id,interaction,participants_json FROM consult_sources WHERE clinic_id=? AND patient_id=?').bind(actor.clinicId,actor.patientId??'patient-1').all<{entry_id:string;id:string;interaction:string;participants_json:string}>();
 return Object.fromEntries(rows.results.map(r=>[r.entry_id,{entryId:r.entry_id,sourceId:r.id,title:`${r.interaction.replaceAll('_','–')} conversation`,humanParticipants:JSON.parse(r.participants_json) as string[]}]));
}
export async function importedTranscript(actor:Actor,id:string):Promise<TranscriptSource|undefined>{
 const row=await env.DB.prepare('SELECT id,interaction,participants_json,messages_json FROM consult_sources WHERE entry_id=? AND clinic_id=? AND patient_id=?').bind(id,actor.clinicId,actor.patientId??'patient-1').first<{id:string;interaction:string;participants_json:string;messages_json:string}>();
 return row?{title:`Imported ${row.interaction} source · redacted`,session:row.id,humanParticipants:JSON.parse(row.participants_json),lines:JSON.parse(row.messages_json)}:undefined;
}
