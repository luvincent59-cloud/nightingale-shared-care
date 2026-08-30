import { env } from "cloudflare:workers";
import { actorFromRequest, recordDenied } from "../../../lib/auth";
import { transcriptSources } from "../../../lib/transcripts";

import { voiceTranscript } from "../../../lib/voice-store";
import {importedTranscript} from "../../../lib/ai-import";
const now=()=>new Date().toISOString();

export async function GET(request:Request){
  const actor=await actorFromRequest(request);const url=new URL(request.url),entryId=url.searchParams.get("entryId")??"";
  if(!actor){await recordDenied(null,"read transcript",entryId||"transcript",request);return Response.json({error:"Authentication required"},{status:401})}
  const scopedEntry=await env.DB.prepare("SELECT id FROM care_entries WHERE id=? AND clinic_id=? AND patient_id=?").bind(entryId,actor.clinicId,actor.patientId??"patient-1").first();
  if(!scopedEntry)return Response.json({error:"Source not found in authorised record"},{status:404});
  const voice=await voiceTranscript(entryId,actor.clinicId);
  const source=voice?{title:"Dictation source · no stored audio",session:voice.id,lines:[{time:"Original",speaker:"Browser transcript / imported text",text:voice.original_text},{time:"Reviewed",speaker:voice.actor_id,text:voice.reviewed_text}],humanParticipants:[voice.actor_id]}:await importedTranscript(actor,entryId)??transcriptSources[entryId];if(!source)return Response.json({error:"source not found"},{status:404});
  const rows=await env.DB.prepare("SELECT * FROM transcript_access_requests WHERE clinic_id=? AND entry_id=? AND status='approved' AND expires_at>? ORDER BY created_at DESC").bind(actor.clinicId,entryId,now()).all<Record<string,string>>();
  const approved=voice?.actor_id===actor.id?{id:"author-access"}:rows.results.find(row=>JSON.stringify((JSON.parse(row.participants_json) as string[]).sort())===JSON.stringify([...source.humanParticipants].sort())&&(row.requester_id===actor.id||(JSON.parse(row.participants_json) as string[]).includes(actor.id)));
  if(!approved){await recordDenied(actor,"read transcript without consent",entryId,request);return Response.json({error:"All human participants must approve before the transcript can be opened."},{status:403})}
  await env.DB.prepare("INSERT INTO audit_events (clinic_id,actor_role,actor_id,action,resource_id,metadata,created_at) VALUES (?,?,?,?,?,?,?)").bind(actor.clinicId,actor.role,actor.id,"transcript_access.viewed",entryId,JSON.stringify({request_id:approved.id}),now()).run();
  const checksum="sha256:"+[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(voice?[voice.original_text,voice.reviewed_text]:source.lines))))].map(b=>b.toString(16).padStart(2,"0")).join("");
  return Response.json({accessBasis:voice?.actor_id===actor.id?"author":"consent",title:source.title,session:source.session,lines:source.lines,pointer:{entry_id:entryId,source_id:source.session.split(" · ")[0],span:voice?"original_text / reviewed_text (v1); no audio timestamps":"highlighted messages",checksum}},{headers:{"Cache-Control":"private, no-store"}});
}
