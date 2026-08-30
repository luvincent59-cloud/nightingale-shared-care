import { env } from "cloudflare:workers";
import {actors} from "./auth";
import {prepareModelInput} from "./privacy";
import {baselineNote} from "./revisions";
import type { Actor } from "./auth";
import { extractMedicalMentions,validateVoiceInput } from "./voice";
import { noteSuggestion } from "./learning-store";

export async function saveVoiceNote(actor:Actor,body:Record<string,unknown>){
 if(!["patient","staff","nurse","clinician"].includes(actor.role))return {status:403,error:"Only care participants can create voice notes"};
 const error=validateVoiceInput(body);if(error)return {status:400,error};
 const created=new Date().toISOString(),id=`entry-${crypto.randomUUID()}`,voiceId=`voice-${crypto.randomUUID()}`;
 const originalText=String(body.originalText),content=prepareModelInput(String(body.reviewedText).trim(),actors.map(a=>a.name)).text,language=String(body.language),method=String(body.method);
 const title=String(body.title??"Voice note").trim().slice(0,160)||"Voice note",isSpeech=method==="browser_speech",source=`${isSpeech?"Browser speech recognition":"Manual transcript"} · ${voiceId} · author reviewed`;
 const mentions=extractMedicalMentions(content).map(m=>({...m,provenance:{entry_id:id,source_id:voiceId,field:"reviewed_text",start:m.start,end:m.end,version:1}}));
 const ops=[
  env.DB.prepare("INSERT INTO care_entries (id,clinic_id,patient_id,owner_role,author_id,kind,title,content,source,confidence,patient_visible,raw_ai,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,actor.clinicId,"patient-1",actor.role,actor.id,isSpeech?"voice_note":"transcript_note",title,content,source,"Author reviewed · not clinically validated",Number(actor.role==="patient"),0,created),
  env.DB.prepare("INSERT INTO voice_records (id,entry_id,clinic_id,patient_id,actor_id,language,method,original_text,reviewed_text,extraction_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(voiceId,id,actor.clinicId,"patient-1",actor.id,language,method,originalText,content,JSON.stringify(mentions),created),
  noteSuggestion({id,title,content},actor,created),
  env.DB.prepare("INSERT INTO audit_events (clinic_id,actor_role,actor_id,action,resource_id,metadata,created_at) VALUES (?,?,?,?,?,?,?)").bind(actor.clinicId,actor.role,actor.id,"voice_note.created",id,JSON.stringify({method,language,consent_attested:true,author_reviewed:true,extraction:"local-glossary-v1",audio_retained:false}),created),
 ];
 if(actor.role==="patient")ops.push(env.DB.prepare("INSERT INTO timeline_projections (id,event_id,clinic_id,patient_id,audience_role,owner_role,author_id,kind,title,content,source,confidence,ai_generated,review_status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(`projection-patient-${id}`,id,actor.clinicId,"patient-1","patient",actor.role,actor.id,isSpeech?"voice_note":"transcript_note",title,content,source,"Author reviewed",Number(isSpeech),"author_reviewed",created));
 ops.push(baselineNote(id,actor.clinicId));await env.DB.batch(ops);return {status:201,ok:true,id};
}
export async function voiceMetadata(actor:Actor){
 if(actor.role==="admin")return {};
 const rows=await env.DB.prepare("SELECT id,entry_id,actor_id,language,method,extraction_json FROM voice_records WHERE clinic_id=? AND patient_id=?"+(actor.role==="patient"?" AND actor_id=?":"")).bind(...(actor.role==="patient"?[actor.clinicId,actor.patientId,actor.id]:[actor.clinicId,"patient-1"])).all<{id:string;entry_id:string;actor_id:string;language:string;method:string;extraction_json:string}>();
 return Object.fromEntries(rows.results.map(r=>[r.entry_id,{entryId:r.entry_id,title:"Single-speaker dictated note",sourceId:r.id,humanParticipants:[r.actor_id],language:r.language,method:r.method,mentions:JSON.parse(r.extraction_json)}]));
}
export async function voiceTranscript(entryId:string,clinicId:string){
 return env.DB.prepare("SELECT * FROM voice_records WHERE entry_id=? AND clinic_id=? AND patient_id=?").bind(entryId,clinicId,"patient-1").first<{id:string;actor_id:string;original_text:string;reviewed_text:string;language:string;method:string}>();
}
