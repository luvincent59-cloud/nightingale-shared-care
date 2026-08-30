import { env } from "cloudflare:workers";
import { actorFromRequest, recordDenied, type Actor, type Role } from "../../../lib/auth";
import { sourceMetadata } from "../../../lib/transcripts";
import { seedImportance, importanceData, reviewSuggestion, entrySignals, noteSuggestion } from "../../../lib/learning-store";
import { teamRoles } from "../../../lib/importance";
import { saveVoiceNote, voiceMetadata } from "../../../lib/voice-store";
import {detectConflicts,conflictData,flagConflict,confirmConflict} from "../../../lib/conflicts";
import {refreshTopCards,readTopCard} from "../../../lib/top-card";
import {baselineNote,changeNote,changePlan,changeComment} from "../../../lib/revisions";
import {prepareImport,importAiNote,importedMetadata} from "../../../lib/ai-import";
import {safeAuditMetadata} from "../../../lib/privacy";
import {actors} from "../../../lib/auth";
const now=()=>new Date().toISOString(); const uid=(p:string)=>`${p}-${crypto.randomUUID()}`;

async function ensureSeeded(){
  const db=env.DB; const count=await db.prepare("SELECT COUNT(*) AS n FROM care_entries").first<{n:number}>(); if(Number(count?.n??0)>0)return;
  const seed = [
    ["entry-aug-26","system","system","ai_doctor_consult_summary","Exertional chest discomfort has increased","Patient reports central chest pressure after climbing two flights of stairs, resolving after 8–10 minutes of rest. Three episodes this week; previously once monthly. No pain at rest.","Consult NC-4821 · transcript 08:14–09:02","94%",0,1,"2026-08-26T09:42:00Z"],
    ["entry-aug-24","staff","priya-nair","staff_note","Cardiology referral awaiting documents","Referral drafted. Latest lipid panel and ECG order are still missing. Patient prefers morning appointments and needs Mandarin interpretation.","Manual entry · Priya Nair","Verified",0,0,"2026-08-24T16:18:00Z"],
    ["entry-aug-20","system","system","ai_patient_session_summary","Patient concerned symptoms are worsening","Patient asked whether exercise remains safe. Reported stopping evening walks because symptoms now occur sooner. Requested a clear plan before the weekend.","Patient session PS-1189 · messages 12–19","89%",0,1,"2026-08-20T20:06:00Z"],
    ["entry-aug-18","system","system","ai_nurse_consult_summary","Exercise tolerance reduced","Nurse call confirmed symptoms begin after approximately five minutes of brisk walking. Patient understood emergency warning signs and agreed to avoid strenuous exercise pending review.","Nurse consult NS-3310 · transcript 03:10–04:05","91%",0,1,"2026-08-18T14:20:00Z"],
    ["entry-feb-06","clinician","dr-samuel-lee","clinician_note","Intermittent exertional discomfort","Single mild episode after brisk walking. Resting ECG normal. Safety-net advice given; review if frequency or severity increases.","Manual entry · signed","Clinician verified",1,0,"2026-02-06T11:30:00Z"]
  ];
  const ops=seed.map(x=>db.prepare("INSERT INTO care_entries (id,clinic_id,patient_id,owner_role,author_id,kind,title,content,source,confidence,patient_visible,raw_ai,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(x[0],"north","patient-1",...x.slice(1)));
  const plan="Arrange same-day ECG and high-sensitivity troponin. Nurse to call by 16:00 with safety-net instructions.";
  ops.push(db.prepare("INSERT INTO care_plans (patient_id,clinic_id,content,version,updated_by,updated_at) VALUES (?,?,?,?,?,?)").bind("patient-1","north",plan,4,"dr-samuel-lee","2026-08-26T09:50:00Z"));
  ops.push(db.prepare("INSERT INTO plan_versions (patient_id,clinic_id,version,content,actor_id,action,created_at) VALUES (?,?,?,?,?,?,?)").bind("patient-1","north",3,"Review after investigations. Continue current medication and reinforce emergency warning signs.","dr-samuel-lee","updated","2026-08-24T16:32:00Z"));
  ops.push(db.prepare("INSERT INTO plan_versions (patient_id,clinic_id,version,content,actor_id,action,created_at) VALUES (?,?,?,?,?,?,?)").bind("patient-1","north",4,plan,"dr-samuel-lee","updated","2026-08-26T09:50:00Z")); await db.batch(ops);
}
async function ensureTimelineProjections(){
  const rows=[
    ["projection-patient-entry-aug-26","entry-aug-26","system","system","patient_consult_summary","Consultation with Dr. Samuel Lee","You reported chest pressure during exercise that has happened more often this week. Your care team is arranging prompt tests and has provided safety-net instructions.","Consult NC-4821 · patient-facing summary","Clinician reviewed",1,"clinician_reviewed","2026-08-26T09:42:00Z"],
    ["projection-patient-entry-aug-20","entry-aug-20","system","system","patient_ai_session_summary","Your Nightingale AI check-in","You shared that chest pressure starts sooner during walks and asked whether exercise is safe. This summary was shared with your care team for follow-up.","Patient session PS-1189 · patient-facing summary","89%",1,"care_team_review_pending","2026-08-20T20:06:00Z"],
    ["projection-patient-entry-aug-18","entry-aug-18","system","system","patient_followup_summary","Nurse follow-up with Mei Tan","You discussed reduced exercise tolerance and confirmed that you understood when to seek urgent help. Avoid strenuous exercise until your care team reviews you.","Follow-up NS-3310 · patient-facing summary","Clinician reviewed",1,"clinician_reviewed","2026-08-18T14:20:00Z"],
    ["projection-patient-entry-feb-06","entry-feb-06","clinician","dr-samuel-lee","patient_consult_summary","February consultation","You reported one mild episode after brisk walking. Your resting ECG was normal and you were advised to return if symptoms became more frequent or severe.","Signed patient summary","Clinician verified",0,"clinician_reviewed","2026-02-06T11:30:00Z"],
  ];
  await env.DB.batch(rows.map(x=>env.DB.prepare("INSERT OR IGNORE INTO timeline_projections (id,event_id,clinic_id,patient_id,audience_role,owner_role,author_id,kind,title,content,source,confidence,ai_generated,review_status,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM care_entries WHERE id=? AND version=1)").bind(x[0],x[1],"north","patient-1","patient",...x.slice(2),x[1])));
  // Correct the synthetic fixture; retire consent obtained for different participants.
  await env.DB.batch([
    env.DB.prepare("UPDATE timeline_projections SET title='Nurse follow-up with Mei Tan' WHERE event_id='entry-aug-18' AND clinic_id='north' AND title='Follow-up call with Priya Nair'"),
    env.DB.prepare("INSERT INTO audit_events (clinic_id,actor_role,actor_id,action,resource_id,metadata,created_at) SELECT clinic_id,'system','system','consent.invalidated_source_correction',id,'{\"source_id\":\"NS-3310\",\"reason\":\"Nurse participant corrected; renew consent\"}',? FROM transcript_access_requests WHERE entry_id='entry-aug-18' AND clinic_id='north' AND status IN ('pending','approved') AND participants_json NOT LIKE '%mei-tan%'").bind(now()),
    env.DB.prepare("UPDATE transcript_access_requests SET status='rejected',resolved_at=? WHERE entry_id='entry-aug-18' AND clinic_id='north' AND status IN ('pending','approved') AND participants_json NOT LIKE '%mei-tan%'").bind(now()),
  ]);
}
async function ensureArchiveSeeded(){
  const archiveId="archive-2014-2023",created="2026-08-26T02:00:00Z";
  const archive=env.DB.prepare("INSERT OR IGNORE INTO timeline_archives (id,clinic_id,patient_id,period_start,period_end,storage_tier,event_count,revision_count,roles_json,manifest_pointer,checksum,compression_version,created_at,verified_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(archiveId,"north","patient-1","2014-01-01","2023-12-31","cold_verified",37,96,JSON.stringify(["patient","staff","nurse","clinician"]),"care-archive://north/patient-1/2014-2023/manifest-v3","sha256:7ac9…e214",3,created,created);
  const projections=[
    ["patient","Between 2014 and 2023, your records mainly covered migraine care, routine preventive visits, and one resolved ankle injury. No unresolved urgent issue was carried forward from this period.",["Migraine pattern improved after 2019","Routine screening remained up to date","2018 ankle injury resolved"]],
    ["staff","2014–2023 coordination history: 37 encounters across primary care and neurology. Interpreter preference was recorded in 2022; no historical referral remains open.",["4 historical referrals — all closed","Mandarin interpreter preference retained","No outstanding administrative task"]],
    ["nurse","2014–2023 nursing context: intermittent migraine monitoring, medication tolerance checks, and preventive-care education. All historical follow-ups were completed.",["No recorded fall risk","Medication tolerance documented","All nursing follow-ups closed"]],
    ["clinician","2014–2023 clinical capsule: episodic migraine without aura, improved after preventive therapy adjustment in 2019; uncomplicated ankle sprain in 2018; routine metabolic and cardiovascular screening without persistent abnormality. No unresolved historical red flags.",["Migraine — stable historical condition","2018 ankle sprain — resolved","No persistent abnormal screening trend"]],
  ];
  const ops=[archive,...projections.map(([role,summary,facts])=>env.DB.prepare("INSERT OR IGNORE INTO archive_projections (id,archive_id,clinic_id,audience_role,summary,key_facts_json,ai_generated,review_status) VALUES (?,?,?,?,?,?,?,?)").bind(`archive-view-${role}-2014-2023`,archiveId,"north",role,summary,JSON.stringify(facts),1,role==="clinician"?"clinician_reviewed":"role_safe_reviewed"))];
  for(const [role,summary] of projections){ops.push(env.DB.prepare("INSERT OR IGNORE INTO archive_versions (id,archive_id,clinic_id,audience_role,version,snapshot_json,actor_id,action,checksum,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(`archive-version-${role}-v1`,archiveId,"north",role,1,JSON.stringify({summary:"Initial decade capsule",policy:"decay-v1"}),"system","compressed","sha256:v1-verified","2026-08-24T02:00:00Z"));ops.push(env.DB.prepare("INSERT OR IGNORE INTO archive_versions (id,archive_id,clinic_id,audience_role,version,snapshot_json,actor_id,action,checksum,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(`archive-version-${role}-v2`,archiveId,"north",role,2,JSON.stringify({summary,policy:"decay-v2",sourceRevisions:96}),"system","recomputed_after_integrity_check","sha256:v2-verified",created))}
  await env.DB.batch(ops);
}
async function denied(actor:Actor|null,action:string,request:Request,resource="care-record"){await recordDenied(actor,action,resource,request);return Response.json({error:"forbidden",reason:actor?`${actor.role} cannot ${action}. A security alert was sent to the account holder.`:"Authentication required. This attempt was recorded."},{status:actor?403:401})}
async function audit(actor:Actor,action:string,resourceId:string,metadata:object={}){await env.DB.prepare("INSERT INTO audit_events (clinic_id,actor_role,actor_id,action,resource_id,metadata,created_at) VALUES (?,?,?,?,?,?,?)").bind(actor.clinicId,actor.role,actor.id,action,resourceId,JSON.stringify(safeAuditMetadata(metadata as Record<string,unknown>)),now()).run()}

function identityMismatch(actor:Actor,request:Request,body:Record<string,unknown>={}){
 const url=new URL(request.url);
 return [request.headers.get("x-role"),request.headers.get("x-actor-role"),url.searchParams.get("role"),body.role,body.owner_role].some(v=>v!=null&&v!==actor.role)
 ||[request.headers.get("x-actor-id"),url.searchParams.get("actorId"),body.author_id,body.actorId].some(v=>v!=null&&v!==actor.id)
 ||(body.kind!=null&&body.kind!==(actor.role==="patient"?"patient_insight":`${actor.role}_note`));
}
export async function GET(request:Request){
  const actor=await actorFromRequest(request);if(!actor)return denied(null,"access records",request);if(identityMismatch(actor,request))return denied(actor,"impersonate another role",request);if(actor.role==="patient"&&["raw_ai","internal_comments"].includes(new URL(request.url).searchParams.get("view")??""))return denied(actor,"read internal records",request);await ensureSeeded();await ensureTimelineProjections();await ensureArchiveSeeded();await seedImportance();
  await detectConflicts(actor);
  const projection=await readTopCard(actor);if(!projection||Date.now()-Date.parse(projection.updated_at)>60000)await refreshTopCards(actor);
  const sources={...sourceMetadata,...await voiceMetadata(actor),...await importedMetadata(actor)};
  const entries=actor.role==="patient"
    ?await env.DB.prepare("SELECT p.id,p.event_id,p.owner_role,p.author_id,p.kind,p.title,p.content,p.source,p.confidence,1 AS patient_visible,0 AS raw_ai,p.ai_generated,p.review_status,1 AS projection,p.created_at,e.version,e.updated_at FROM timeline_projections p JOIN care_entries e ON e.id=p.event_id AND e.clinic_id=p.clinic_id WHERE p.clinic_id=? AND p.patient_id=? AND audience_role='patient' ORDER BY p.created_at DESC").bind(actor.clinicId,actor.patientId).all()
    :await env.DB.prepare("SELECT *,id AS event_id,CASE WHEN kind='voice_note' THEN 1 ELSE raw_ai END AS ai_generated,CASE WHEN kind IN ('voice_note','transcript_note') THEN 'author_reviewed' WHEN raw_ai=1 THEN 'review_required' ELSE 'signed' END AS review_status,0 AS projection FROM care_entries WHERE clinic_id=? AND patient_id=? ORDER BY created_at DESC").bind(actor.clinicId,"patient-1").all();
  const comments=actor.role==="patient"?{results:[]}:await env.DB.prepare("SELECT * FROM comments WHERE clinic_id=? ORDER BY created_at ASC").bind(actor.clinicId).all();
  const plan=await env.DB.prepare("SELECT * FROM care_plans WHERE clinic_id=? AND patient_id=?").bind(actor.clinicId,"patient-1").first();
  const versions=actor.role==="patient"?{results:[]}:await env.DB.prepare("SELECT * FROM plan_versions WHERE clinic_id=? AND patient_id=? ORDER BY version DESC").bind(actor.clinicId,"patient-1").all();
  const audits=actor.role==="patient"?{results:[]}:await env.DB.prepare("SELECT * FROM audit_events WHERE clinic_id=? ORDER BY id DESC LIMIT 100").bind(actor.clinicId).all();
  const alertSql=actor.role==="admin"?"SELECT * FROM security_alerts WHERE clinic_id=? ORDER BY created_at DESC LIMIT 100":"SELECT * FROM security_alerts WHERE clinic_id=? AND target_actor_id=? ORDER BY created_at DESC LIMIT 30";
  const alerts=actor.role==="admin"?await env.DB.prepare(alertSql).bind(actor.clinicId).all():await env.DB.prepare(alertSql).bind(actor.clinicId,actor.id).all();
  const consentRows=await env.DB.prepare("SELECT * FROM transcript_access_requests WHERE clinic_id=? ORDER BY created_at DESC").bind(actor.clinicId).all<Record<string,string>>();
  const consentRequests=consentRows.results.filter(row=>row.requester_id===actor.id||(JSON.parse(row.participants_json) as string[]).includes(actor.id));
  const archives=actor.role==="admin"?{results:[]}:await env.DB.prepare("SELECT a.*,p.summary,p.key_facts_json,p.ai_generated,p.review_status,p.audience_role FROM timeline_archives a JOIN archive_projections p ON p.archive_id=a.id AND p.clinic_id=a.clinic_id WHERE a.clinic_id=? AND a.patient_id=? AND p.audience_role=? ORDER BY a.period_end DESC").bind(actor.clinicId,"patient-1",actor.role).all();
  const archiveVersions=actor.role==="admin"?{results:[]}:await env.DB.prepare("SELECT * FROM archive_versions WHERE clinic_id=? AND audience_role=? ORDER BY archive_id,version DESC").bind(actor.clinicId,actor.role).all();
  const importance=await importanceData(actor);
  const completedRisks=await env.DB.prepare("SELECT entry_id FROM highlight_suggestions WHERE clinic_id=? AND patient_id=? AND severity IN ('high','medium') AND resolved_at IS NOT NULL").bind(actor.clinicId,actor.patientId??"patient-1").all<{entry_id:string}>();
  const resolvedRiskEntries=completedRisks.results.map(r=>r.entry_id).filter(id=>entries.results.some(e=>(e.event_id??e.id)===id));
  const tasks=actor.role==="admin"?{results:[]}:actor.role==="patient"?await env.DB.prepare("SELECT t.id,t.entry_id,NULL AS highlight_id,'Care-team follow-up' AS label,t.assignee,t.completed FROM care_tasks t JOIN timeline_projections p ON p.event_id=t.entry_id AND p.clinic_id=t.clinic_id AND p.patient_id=t.patient_id AND p.audience_role='patient' WHERE t.clinic_id=? AND t.patient_id=?").bind(actor.clinicId,actor.patientId).all():await env.DB.prepare("SELECT * FROM care_tasks WHERE clinic_id=? AND patient_id=? ORDER BY id").bind(actor.clinicId,actor.patientId??"patient-1").all();
  const conflicts=await conflictData(actor);
  const sourcedEntries=entries.results.map(e=>({...e,created_at:e.created_at,provenance_pointer:{entry_id:e.event_id??e.id,source_id:sources[String(e.event_id??e.id)]?.sourceId??e.event_id??e.id,field:sources[String(e.event_id??e.id)]?"source session":"content",version:e.version??1}}));
  const eventRows=await env.DB.prepare("SELECT r.* FROM record_events r LEFT JOIN care_entries e ON e.id=r.entry_id AND e.clinic_id=r.clinic_id WHERE r.clinic_id=? AND r.patient_id=?"+(actor.role==="patient"?" AND r.patient_visible=1 AND (r.entry_id='care-plan' OR e.patient_visible=1)":"")+" ORDER BY r.created_at DESC LIMIT 100").bind(actor.clinicId,actor.patientId??"patient-1").all();
  const systemEvents=eventRows.results.map(r=>({id:r.id,event_id:r.id,owner_role:"system",author_id:r.actor_id,kind:"system_event",title:String(r.action).replaceAll("."," "),content:`${r.actor_role} saved version ${r.version}. Source history is retained.`,source:r.entry_id,confidence:"System event",patient_visible:r.patient_visible,raw_ai:0,ai_generated:0,review_status:"recorded",projection:Number(actor.role==="patient"),created_at:r.created_at,version:r.version,related_entry_id:r.entry_id,provenance_pointer:{entry_id:r.entry_id,version:r.version,field:"snapshot"}}));
  const stats=actor.role==="admin"?{patients:new Set(entries.results.map(e=>e.patient_id)).size,users:actors.filter(a=>a.clinicId===actor.clinicId&&a.role!=="patient").length,openTasks:Number((await env.DB.prepare("SELECT COUNT(*) n FROM care_tasks WHERE clinic_id=? AND completed=0").bind(actor.clinicId).first<{n:number}>())?.n??0)}:undefined;
  return Response.json({actor,stats,conflicts,entries:[...sourcedEntries,...systemEvents].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))),comments:comments.results,plan,versions:versions.results,audits:audits.results.map(a=>({...a,metadata:JSON.stringify(safeAuditMetadata(JSON.parse(String(a.metadata))))})),alerts:alerts.results,consentRequests,sourceMetadata:sources,archives:archives.results,archiveVersions:archiveVersions.results,...importance,resolvedRiskEntries,tasks:tasks.results,syncedAt:now()},{headers:{"Cache-Control":"private, no-store"}});
}

async function mutate(request:Request){
  const actor=await actorFromRequest(request);if(!actor)return denied(null,"write records",request);await ensureSeeded();await ensureTimelineProjections();await ensureArchiveSeeded();await seedImportance();const body=await request.json() as Record<string,string|number|boolean>;const action=String(body.action??"");
  if(identityMismatch(actor,request,body))return denied(actor,"impersonate another role",request);
  if(["edit_note","revert_note","save_plan","revert_plan","resolve_comment"].includes(action)){
    const result=["edit_note","revert_note"].includes(action)?await changeNote(actor,body):action==="resolve_comment"?await changeComment(actor,body):await changePlan(actor,body);
    if(result.status===403)return denied(actor,"modify another role's protected section",request);
    return Response.json(result,{status:result.status});
  }
  if(action==="preview_ai_import"||action==="import_ai_note"){
    const result=action==="preview_ai_import"?await prepareImport(actor,body):await importAiNote(actor,body);
    if(result.status===403)return denied(actor,"import an unauthorised AI note",request);
    return Response.json(result,{status:result.status,headers:action==="preview_ai_import"?{"X-Care-Preview":"1"}:{}});
  }
  if(action==="flag_conflict"||action==="confirm_conflict"){
    if(!teamRoles.includes(actor.role)||action==="confirm_conflict"&&actor.role!=="clinician")return denied(actor,"review conflicting records",request);
    const result=action==="flag_conflict"?await flagConflict(actor,String(body.clinicianEntryId??""),String(body.otherEntryId??""),String(body.reason??"")):await confirmConflict(actor,String(body.conflictId??""),String(body.reason??""));
    return Response.json(result,{status:result.status});
  }
  if(action==="save_voice_note"){
    if(actor.role==="admin")return denied(actor,"create voice notes",request,"patient-1");
    const result=await saveVoiceNote(actor,body);return Response.json(result,{status:result.status});
  }
  if(action==="add_note"){
    if(!(["staff","nurse","clinician","patient"] as Role[]).includes(actor.role))return denied(actor,"create notes",request,"patient-1");const content=String(body.content??"").trim();if(!content)return Response.json({error:"content required"},{status:400});
    const kind=actor.role==="patient"?"patient_insight":`${actor.role}_note`,id=uid("entry"),created=now(),title=String(body.title??"New care note"),visible=actor.role==="patient"||Boolean(body.patientVisible);const ops=[env.DB.prepare("INSERT INTO care_entries (id,clinic_id,patient_id,owner_role,author_id,kind,title,content,source,confidence,patient_visible,raw_ai,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,actor.clinicId,"patient-1",actor.role,actor.id,kind,title,content,"Manual entry · signed","Human authored",Number(visible),0,created)];
    ops.push(noteSuggestion({id,title,content},actor,created));
    if(visible)ops.push(env.DB.prepare("INSERT INTO timeline_projections (id,event_id,clinic_id,patient_id,audience_role,owner_role,author_id,kind,title,content,source,confidence,ai_generated,review_status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(`projection-patient-${id}`,id,actor.clinicId,"patient-1","patient",actor.role,actor.id,kind,title,content,"Manual entry · signed","Human authored",0,"signed",created));ops.push(baselineNote(id,actor.clinicId));ops.push(env.DB.prepare("INSERT INTO audit_events (clinic_id,actor_role,actor_id,action,resource_id,metadata,created_at) VALUES (?,?,?,?,?,?,?)").bind(actor.clinicId,actor.role,actor.id,"entry.created",id,JSON.stringify({kind,version:1}),created));await env.DB.batch(ops);return Response.json({ok:true,id,eventId:id},{status:201});
  }
  if(action==="comment"){
    if(!teamRoles.includes(actor.role))return denied(actor,"access internal comments",request,String(body.entryId??"entry"));
    const entryId=String(body.entryId??""),content=String(body.content??"").trim(),mention=String(body.mention??"");
    const entry=await env.DB.prepare("SELECT id FROM care_entries WHERE id=? AND clinic_id=? AND patient_id=?").bind(entryId,actor.clinicId,"patient-1").first();
    if(!entry)return Response.json({error:"Entry not found"},{status:404});
    if(!content)return Response.json({error:"Comment required"},{status:400});
    const id=uid("comment"),signal=mention?"mention":"comment";
    await env.DB.batch([env.DB.prepare("INSERT INTO comments (id,entry_id,clinic_id,author_role,author_id,body,mention,resolved,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(id,entryId,actor.clinicId,actor.role,actor.id,content,mention,0,now()),...await entrySignals(actor,entryId,signal)]);
    await audit(actor,"comment.created",entryId,{mention,learning_signal:signal});return Response.json({ok:true,id},{status:201});
  }
  if(action==="highlight_decision"){
    if(actor.role!=="clinician")return denied(actor,"review AI highlights",request,String(body.highlightId??"highlight"));
    const result=await reviewSuggestion(actor,String(body.highlightId??""),String(body.decision??""),String(body.reason??""));return Response.json(result,{status:result.status});
  }
  if(action==="resolve_highlight"){
    if(!teamRoles.includes(actor.role))return denied(actor,"complete highlights",request,String(body.highlightId??"highlight"));
    const id=String(body.highlightId??""),item=await env.DB.prepare("SELECT * FROM highlight_suggestions WHERE id=? AND clinic_id=? AND patient_id=?").bind(id,actor.clinicId,"patient-1").first<{severity:string;entity_key:string;entry_id:string;resolved_at:string|null}>();
    if(!item)return Response.json({error:"Highlight not found"},{status:404});
    if((item.severity==="high"||["exertional_chest_pain","cardiac_testing"].includes(item.entity_key))&&actor.role!=="clinician")return denied(actor,"close clinical risk",request,id);
    const linked=await env.DB.prepare("SELECT id FROM care_tasks WHERE highlight_id=? AND clinic_id=? AND completed=0").bind(id,actor.clinicId).first();
    if(linked)return Response.json({error:"Complete the linked tasks first"},{status:409});
    if(item.resolved_at)return Response.json({error:"Already completed"},{status:409});
    const reason=String(body.reason??"").trim();if(reason.length<8)return Response.json({error:"Describe why this item is completed (at least 8 characters)"},{status:400});
    await env.DB.batch([env.DB.prepare("UPDATE highlight_suggestions SET resolved_at=?,resolved_by=? WHERE id=? AND clinic_id=? AND resolved_at IS NULL").bind(now(),actor.id,id,actor.clinicId),...await entrySignals(actor,item.entry_id,"complete")]);
    await audit(actor,"highlight.completed",id,{reason});return Response.json({ok:true});
  }
  if(action==="assign_followup"){
    if(!teamRoles.includes(actor.role))return denied(actor,"assign follow-up",request,String(body.entryId??"entry"));
    const entryId=String(body.entryId??""),entry=await env.DB.prepare("SELECT title FROM care_entries WHERE id=? AND clinic_id=? AND patient_id=?").bind(entryId,actor.clinicId,"patient-1").first<{title:string}>();
    if(!entry)return Response.json({error:"Entry not found"},{status:404});
    await env.DB.batch([env.DB.prepare("INSERT OR IGNORE INTO care_tasks (id,clinic_id,patient_id,entry_id,label,assignee,completed,updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(`followup:${entryId}`,actor.clinicId,"patient-1",entryId,`Follow up: ${entry.title}`,actor.id,0,now()),...await entrySignals(actor,entryId,"assign")]);
    await audit(actor,"followup.assigned",entryId,{assignee:actor.id});return Response.json({ok:true});
  }
  if(action==="task_status"){
    if(!teamRoles.includes(actor.role))return denied(actor,"complete care tasks",request,String(body.taskId??"task"));
    const id=String(body.taskId??""),completed=body.completed;
    if(typeof completed!=="boolean")return Response.json({error:"Boolean completion required"},{status:400});
    const task=await env.DB.prepare("SELECT * FROM care_tasks WHERE id=? AND clinic_id=? AND patient_id=?").bind(id,actor.clinicId,"patient-1").first<{entry_id:string;highlight_id:string|null;assignee:string;completed:number}>();
    if(!task)return Response.json({error:"Task not found"},{status:404});
    if(actor.role!=="clinician"&&task.assignee!==actor.id)return denied(actor,"complete another person's task",request,id);
    const ops=[env.DB.prepare("UPDATE care_tasks SET completed=?,updated_at=? WHERE id=? AND clinic_id=?").bind(Number(completed),now(),id,actor.clinicId)];
    if(task.highlight_id)ops.push(env.DB.prepare("UPDATE highlight_suggestions SET resolved_at=CASE WHEN EXISTS(SELECT 1 FROM care_tasks WHERE highlight_id=? AND clinic_id=? AND completed=0) THEN NULL ELSE ? END,resolved_by=? WHERE id=? AND clinic_id=?").bind(task.highlight_id,actor.clinicId,now(),actor.id,task.highlight_id,actor.clinicId));
    if(completed&&!task.completed)ops.push(...await entrySignals(actor,task.entry_id,"complete"));
    await env.DB.batch(ops);await audit(actor,completed?"task.completed":"task.reopened",id);return Response.json({ok:true});
  }
  if(action==="request_transcript"){
    const entryId=String(body.entryId??""),source=({...sourceMetadata,...await voiceMetadata(actor),...await importedMetadata(actor)})[entryId];if(!source)return Response.json({error:"source not found"},{status:404});
    if(actor.role==="admin")return denied(actor,"request clinical transcripts",request,entryId);
    const existing=await env.DB.prepare("SELECT id,status,participants_json FROM transcript_access_requests WHERE clinic_id=? AND entry_id=? AND requester_id=? AND status IN ('pending','approved') AND expires_at>? ORDER BY created_at DESC LIMIT 1").bind(actor.clinicId,entryId,actor.id,now()).first<{id:string;status:string;participants_json:string}>();
    if(existing&&JSON.stringify(JSON.parse(existing.participants_json).sort())===JSON.stringify([...source.humanParticipants].sort()))return Response.json({ok:true,id:existing.id,status:existing.status,reused:true});
    const reason=String(body.reason??"").trim();if(reason.length<8)return Response.json({error:"A clear access reason is required"},{status:400});
    const approvals=Object.fromEntries(source.humanParticipants.map(person=>[person,person===actor.id?"approved":"pending"]));
    const status=Object.values(approvals).every(value=>value==="approved")?"approved":"pending",id=uid("consent"),created=now(),expires=new Date(Date.now()+24*60*60*1000).toISOString();
    await env.DB.prepare("INSERT INTO transcript_access_requests (id,clinic_id,entry_id,requester_id,participants_json,approvals_json,status,reason,created_at,expires_at,resolved_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(id,actor.clinicId,entryId,actor.id,JSON.stringify(source.humanParticipants),JSON.stringify(approvals),status,reason,created,expires,status==="approved"?created:null).run();
    await audit(actor,"transcript_access.requested",entryId,{request_id:id,human_participants:source.humanParticipants,status});return Response.json({ok:true,id,status},{status:201});
  }
  if(action==="respond_transcript"){
    const requestId=String(body.requestId??""),decision=String(body.decision??"");if(!["approved","rejected"].includes(decision))return Response.json({error:"invalid decision"},{status:400});
    const row=await env.DB.prepare("SELECT * FROM transcript_access_requests WHERE id=? AND clinic_id=?").bind(requestId,actor.clinicId).first<Record<string,string>>();if(!row)return Response.json({error:"request not found"},{status:404});
    const people=JSON.parse(row.participants_json) as string[];if(!people.includes(actor.id))return denied(actor,"respond to another participant's consent",request,row.entry_id);
    if(row.status!=="pending")return Response.json({error:"request already resolved"},{status:409});
    if(row.expires_at<=now())return Response.json({error:"request expired; ask for a new request"},{status:409});
    const approvals=JSON.parse(row.approvals_json) as Record<string,string>;approvals[actor.id]=decision;const status=Object.values(approvals).includes("rejected")?"rejected":Object.values(approvals).every(value=>value==="approved")?"approved":"pending";
    const updated=await env.DB.prepare("UPDATE transcript_access_requests SET approvals_json=?,status=?,resolved_at=? WHERE id=? AND clinic_id=? AND status='pending' AND approvals_json=? AND expires_at>?").bind(JSON.stringify(approvals),status,status==="pending"?null:now(),requestId,actor.clinicId,row.approvals_json,now()).run();if(!updated.meta.changes)return Response.json({error:"Consent changed concurrently; reload before responding"},{status:409});await audit(actor,`transcript_access.${decision}`,row.entry_id,{request_id:requestId,status});return Response.json({ok:true,status});
  }
  return Response.json({error:"unknown action"},{status:400});
}

export async function POST(request:Request){
 const response=await mutate(request);
 if(response.ok&&!response.headers.has("X-Care-Preview")){const actor=await actorFromRequest(request);if(actor){await detectConflicts(actor);try{await refreshTopCards(actor)}catch{await env.DB.prepare("DELETE FROM top_card_projections WHERE clinic_id=? AND patient_id=?").bind(actor.clinicId,actor.patientId??"patient-1").run()}}}
 return response;
}
