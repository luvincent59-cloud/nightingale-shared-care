import test from 'node:test';
import assert from 'node:assert/strict';
import {importSource,sqlite,GET,identities,reset,get,post} from './helpers/care-harness.mjs';
const {rankSuggestions}=await importSource('lib/importance.ts');
const suggestion=(id,changes={})=>({id,entry_id:id,entity_key:'care_followup',label:id,meta:'',severity:'low',risk_reason:'Open review',provenance_pointer:'{}',status:'pending',created_at:'2026-08-26T00:00:00Z',resolved_at:null,...changes});

test('newer + unfinished rank higher and scores decay with real time',()=>{
 const clock=Date.parse('2026-08-27');
 const rows=rankSuggestions([suggestion('old',{created_at:'2025-01-01'}),suggestion('complete',{resolved_at:'2026-08-26'}),suggestion('new')],[],'clinician',clock);
 assert.equal(rows[0].id,'new');assert.equal(rows.at(-1).id,'complete');
 assert.ok(rankSuggestions([suggestion('x')],[],'clinician',clock)[0].final_score>rankSuggestions([suggestion('x')],[],'clinician',clock+86400000*90)[0].final_score);
});
test('urgent unresolved risk remains first even with adverse learned feedback',()=>{
 const signals=Array.from({length:100},()=>({entity_key:'care_followup',actor_role:'clinician',signal:'reject_relevance',value:-1,created_at:'2026-08-26'}));
 const rows=rankSuggestions([suggestion('routine',{entity_key:'other'}),suggestion('urgent',{severity:'high',created_at:'2014-01-01'})],signals,'clinician',Date.parse('2026-08-27'));
 assert.equal(rows[0].id,'urgent');assert.equal(rows[0].safety_pinned,true);
});
test('only authenticated clinician can review, unknown resources do not teach',async()=>{
 await reset();for(const role of ['staff','nurse','patient','admin'])assert.equal((await post({action:'highlight_decision',highlightId:'h-language',decision:'accepted'},role)).status,403);
 assert.equal((await post({action:'highlight_decision',highlightId:'other-clinic',decision:'accepted'})).status,404);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM learning_signals').get().n,0);
 assert.equal((await post({action:'comment',entryId:'foreign',content:'test'},'staff')).status,404);
});
test('review is persistent, replay-safe, and influences a new similar note',async()=>{
 await reset();const before=(await get()).highlights.find(h=>h.id==='h-language').learned_boost;
 const action={action:'highlight_decision',highlightId:'h-language',decision:'accepted'};
 assert.equal((await post(action)).status,200);assert.equal((await post(action)).status,409);
 const data=await get();assert.equal(data.highlights.find(h=>h.id==='h-language').status,'accepted');assert.ok(data.highlights.find(h=>h.id==='h-language').learned_boost>before);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM highlight_feedback').get().n,1);
 const r=await post({action:'add_note',title:'Interpreter for next appointment',content:'Mandarin interpreter requested'},'nurse');assert.equal(r.status,201);
 const {id}=await r.json();const next=(await get()).highlights.find(h=>h.entry_id===id);assert.ok(next);assert.ok(next.learned_boost>0);assert.equal(JSON.parse(next.provenance_pointer).entry_id,id);
});
test('inaccurate rejection is not negative relevance and urgent flag survives',async()=>{
 await reset();assert.equal((await post({action:'highlight_decision',highlightId:'h-chest',decision:'rejected',reason:'inaccurate'})).status,200);
 const h=(await get()).highlights[0];assert.equal(h.id,'h-chest');assert.equal(h.status,'rejected');assert.equal(h.safety_pinned,true);assert.equal(h.learned_boost,0);
 assert.equal((await post({action:'resolve_highlight',highlightId:'h-chest',reason:'Assessed and resolved'},'nurse')).status,403);
 assert.equal((await post({action:'resolve_highlight',highlightId:'h-chest',reason:'Assessed and resolved'})).status,200);
 assert.ok((await get()).highlightHistory.some(h=>h.id==='h-chest'));
});
test('relevance rejection down-ranks similar items and preserves source/history',async()=>{
 await reset();await post({action:'highlight_decision',highlightId:'h-language',decision:'rejected',reason:'not_relevant'});
 const data=await get();assert.ok(!data.highlights.some(h=>h.id==='h-language'));assert.ok(data.highlightHistory.find(h=>h.id==='h-language').learned_boost<0);assert.ok(data.entries.some(e=>e.id==='entry-aug-24'));
});
test('staff and nurse behaviour is deduplicated and role-specific, not a review',async()=>{
 await reset();for(let i=0;i<8;i++)await post({action:'comment',entryId:'entry-aug-24',content:'Follow-up needed'},'staff');
 await post({action:'comment',entryId:'entry-aug-24',content:'Please arrange',mention:'@Priya Nair'},'nurse');
 const signals=sqlite.prepare('SELECT * FROM learning_signals').all();assert.equal(signals.length,4);assert.ok(signals.some(s=>s.actor_role==='nurse'));
 const staff=(await get('staff')).highlights.find(h=>h.id==='h-language');const doctor=(await get()).highlights.find(h=>h.id==='h-language');
 assert.ok(staff.learned_boost>doctor.learned_boost);assert.equal(staff.status,'pending');
});
test('tasks persist and complete only their linked work; reopen restores it',async()=>{
 await reset();assert.equal((await post({action:'task_status',taskId:'task-ecg',completed:true},'staff')).status,403);
 await post({action:'task_status',taskId:'task-ecg',completed:true});assert.ok((await get()).highlights.some(h=>h.id==='h-ecg'));
 await post({action:'task_status',taskId:'task-lipid',completed:true},'staff');let data=await get();assert.ok(data.highlightHistory.some(h=>h.id==='h-ecg'));assert.ok(data.highlights.some(h=>h.id==='h-chest'));
 await post({action:'task_status',taskId:'task-lipid',completed:false},'staff');data=await get();assert.ok(data.highlights.some(h=>h.id==='h-ecg'));assert.equal(data.tasks.find(t=>t.id==='task-ecg').completed,1);
});
test('patient and admin receive no learning internals; source consent remains separate',async()=>{
 await reset();await post({action:'add_note',title:'INTERNAL ONLY',content:'PRIVATE BODY'},'staff');
 const entries=(await get()).entries;const id=entries.find(e=>e.title==='INTERNAL ONLY').id;await post({action:'assign_followup',entryId:id},'staff');
 for(const role of ['patient','admin']){const data=await get(role);assert.deepEqual(data.highlights,[]);assert.deepEqual(data.highlightHistory,[]);assert.deepEqual(data.learningProfile,[])}
 const patient=JSON.stringify(await get('patient'));assert.ok(!patient.includes('PRIVATE BODY'));assert.ok(!patient.includes('INTERNAL ONLY'));
 await post({action:'highlight_decision',highlightId:'h-chest',decision:'accepted'});assert.equal(sqlite.prepare('SELECT count(*) n FROM transcript_access_requests').get().n,0);
});
test('clinic signals never leak across clinic boundary',async()=>{
 await reset();sqlite.prepare('INSERT INTO learning_signals VALUES (?,?,?,?,?,?,?,?,?,?)').run('foreign','south','other','language_preference','foreign','foreign','clinician','accept',1,'2026-08-27');
 assert.equal((await get()).highlights.find(h=>h.id==='h-language').signal_count,0);
});

const {extractMedicalMentions}=await importSource('lib/voice.ts');
const {GET:readTranscript}=await importSource('app/api/transcript/route.ts');
const voiceBody={action:'save_voice_note',title:'Voice review',originalText:'No chest pain. Metformin 50 mg for 3 days.',reviewedText:'No chest pain. Metformin 500 mg for 3 days.',language:'en-SG',method:'browser_speech',consent:true,reviewed:true};
async function transcript(id,role){return readTranscript(new Request(`https://care.test/api/transcript?entryId=${id}`,{headers:{cookie:`ng_session=${role}`}}))}

test('local medical matching preserves text offsets and warns about negation without diagnosis',()=>{
 const text='患者否认胸痛。服用二甲双胍500毫克，每天一次。';
 const mentions=extractMedicalMentions(text);assert.ok(mentions.length>=4);
 for(const m of mentions)assert.equal(text.slice(m.start,m.end),m.matched);
 assert.match(mentions.find(m=>m.matched==='胸痛').context,/Negation/);
 assert.ok(!mentions.some(m=>m.category==='Diagnosis'));
 assert.equal(extractMedicalMentions('Please arrange an interpreter').length,0);
});
test('voice notes require explicit consent and review; admin and oversized input are rejected',async()=>{
 await reset();for(const body of [{...voiceBody,consent:false},{...voiceBody,reviewed:false},{...voiceBody,language:'invented'},{...voiceBody,originalText:'a'.repeat(12001)}])assert.equal((await post(body)).status,400);
 assert.equal((await post(voiceBody,'admin')).status,403);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM voice_records').get().n,0);
});
test('patient dictation creates a shared event without exposing the original draft in normal reads',async()=>{
 await reset();const result=await post(voiceBody,'patient');assert.equal(result.status,201);const {id}=await result.json();
 const patient=await get('patient'),doctor=await get();assert.ok(patient.entries.some(e=>e.event_id===id));assert.ok(doctor.entries.some(e=>e.id===id));
 assert.ok(!JSON.stringify(doctor).includes('Metformin 50 mg'));assert.ok(!JSON.stringify(patient).includes('Metformin 50 mg'));
 assert.equal(patient.sourceMetadata[id].method,'browser_speech');assert.ok(doctor.highlights.some(h=>h.entry_id===id));
 assert.equal((await transcript(id,'doctor')).status,403);const own=await transcript(id,'patient');assert.equal(own.status,200);const source=await own.json();assert.equal(source.lines[0].text,voiceBody.originalText);assert.equal(source.lines[1].text,voiceBody.reviewedText);assert.match(source.pointer.checksum,/^sha256:[a-f0-9]{64}$/);assert.equal(source.accessBasis,'author');
});
test('another clinician must obtain author consent before reading a dictated original',async()=>{
 await reset();const {id}=await (await post(voiceBody,'patient')).json();const consent=await (await post({action:'request_transcript',entryId:id,reason:'Verify speech recognition dosage'})).json();
 assert.equal(consent.status,'pending');assert.equal((await transcript(id,'doctor')).status,403);
 await post({action:'respond_transcript',requestId:consent.id,decision:'approved'},'patient');assert.equal((await transcript(id,'doctor')).status,200);
 sqlite.prepare("UPDATE transcript_access_requests SET expires_at='2000-01-01' WHERE id=?").run(consent.id);assert.equal((await transcript(id,'doctor')).status,403);
 const renewed=await (await post({action:'request_transcript',entryId:id,reason:'Renew consent to verify dosage'})).json();assert.notEqual(renewed.id,consent.id);
});
test('staff dictation and raw draft stay out of patient view; manual fallback is not labelled AI transcription',async()=>{
 await reset();const {id}=await (await post({...voiceBody,title:'Private staff dictation'},'staff')).json();const patient=await get('patient');assert.ok(!patient.sourceMetadata[id]);assert.ok(!patient.entries.some(e=>e.event_id===id));assert.equal((await transcript(id,'patient')).status,403);
 const manual=await (await post({...voiceBody,method:'manual_transcript'},'patient')).json();const entry=(await get('patient')).entries.find(e=>e.event_id===manual.id);assert.equal(entry.ai_generated,0);assert.equal(entry.kind,'transcript_note');
});

// Challenge acceptance checks exercise the shipped handlers, not a parallel policy model.
test('staff cannot impersonate clinician through JSON, URL, headers or a forged session',async()=>{
 await reset();const before=sqlite.prepare('SELECT count(*) n FROM care_entries').get().n;
 for(const forged of [{role:'clinician'},{owner_role:'clinician'},{author_id:identities.doctor},{kind:'clinician_note'}])assert.equal((await post({action:'add_note',content:'spoof',...forged},'staff')).status,403);
 assert.equal((await GET(new Request('https://care.test/api/care?role=clinician',{headers:{cookie:'ng_session=staff','x-actor-role':'clinician'}}))).status,403);
 assert.equal((await GET(new Request('https://care.test/api/care',{headers:{cookie:'ng_session=invented','x-role':'clinician'}}))).status,401);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM care_entries').get().n,before);
 const {id}=await (await post({action:'add_note',content:'Actual staff entry'},'staff')).json();assert.equal(sqlite.prepare('SELECT author_id FROM care_entries WHERE id=?').get(id).author_id,identities.staff);
 assert.equal((await post({action:'save_plan',expectedVersion:4,content:'forged plan'},'staff')).status,403);
});
test('clinician cannot impersonate staff through JSON, URL or comment attribution',async()=>{
 await reset();for(const forged of [{role:'staff'},{owner_role:'staff'},{author_id:identities.staff},{kind:'staff_note'}])assert.equal((await post({action:'add_note',content:'spoof',...forged})).status,403);
 assert.equal((await GET(new Request('https://care.test/api/care?role=staff',{headers:{cookie:'ng_session=doctor'}}))).status,403);
 assert.equal((await post({action:'comment',entryId:'entry-aug-24',content:'spoof',author_id:identities.staff})).status,403);
 const {id}=await (await post({action:'add_note',content:'Actual clinician entry'})).json();const row=sqlite.prepare('SELECT owner_role,author_id FROM care_entries WHERE id=?').get(id);assert.equal(row.owner_role,'clinician');assert.equal(row.author_id,identities.doctor);
});
test('patient cannot read or mutate internal comments, even with a known comment ID',async()=>{
 await reset();const {id}=await (await post({action:'comment',entryId:'entry-aug-24',content:'PRIVATE-COMMENT-CANARY',mention:'PRIVATE-MENTION'})).json();
 const data=await get('patient');assert.deepEqual(data.comments,[]);assert.ok(!JSON.stringify(data).includes('PRIVATE-COMMENT-CANARY'));
 assert.equal((await GET(new Request('https://care.test/api/care?view=internal_comments',{headers:{cookie:'ng_session=patient'}}))).status,403);
 assert.equal((await post({action:'comment',entryId:'entry-aug-24',content:'intrusion'},'patient')).status,403);
 assert.equal((await post({action:'resolve_comment',commentId:id,resolved:true},'patient')).status,403);
 assert.equal(sqlite.prepare('SELECT resolved FROM comments WHERE id=?').get(id).resolved,0);
});
test('all three AI summary types have distinct provenance; patient cannot retrieve their raw notes',async()=>{
 await reset();const clinical=await get(),patient=await get('patient'),raw=clinical.entries.filter(e=>e.raw_ai);
 assert.deepEqual(raw.map(e=>e.kind).sort(),['ai_doctor_consult_summary','ai_nurse_consult_summary','ai_patient_session_summary'].sort());
 for(const e of raw){assert.equal(e.ai_generated,1);assert.equal(e.owner_role,'system');assert.ok(clinical.sourceMetadata[e.id]);assert.equal(e.provenance_pointer.source_id,clinical.sourceMetadata[e.id].sourceId);assert.ok(patient.entries.some(p=>p.event_id===e.id&&p.projection===1));assert.ok(!JSON.stringify(patient).includes(e.content));}
 assert.deepEqual(clinical.sourceMetadata['entry-aug-18'].humanParticipants,['mei-tan','maya-chen']);assert.equal(patient.entries.find(e=>e.event_id==='entry-aug-18').title,'Nurse follow-up with Mei Tan');
 assert.equal((await GET(new Request('https://care.test/api/care?view=raw_ai',{headers:{cookie:'ng_session=patient'}}))).status,403);
 assert.equal((await transcript('entry-aug-26','patient')).status,403);
});
test('nurse conversation consent requires the nurse, never the old staff fixture',async()=>{
 await reset();const {id}=await (await post({action:'request_transcript',entryId:'entry-aug-18',reason:'Check nurse source evidence'})).json();
 assert.equal((await post({action:'respond_transcript',requestId:id,decision:'approved'},'staff')).status,403);
 await post({action:'respond_transcript',requestId:id,decision:'approved'},'patient');assert.equal((await transcript('entry-aug-18','doctor')).status,403);
 await post({action:'respond_transcript',requestId:id,decision:'approved'},'nurse');const r=await transcript('entry-aug-18','doctor');assert.equal(r.status,200);assert.match((await r.json()).pointer.checksum,/^sha256:[a-f0-9]{64}$/);
});
const {extractClaims}=await importSource('lib/conflicts.ts');
const {GET:readTopCard}=await importSource('app/api/top-card/route.ts');
const top=role=>readTopCard(new Request('https://care.test/api/top-card',{headers:{cookie:`ng_session=${role}`}}));
test('AI and patient discrepancies prefer clinician source, preserve originals and require clinician confirmation',async()=>{
 await reset();const {id:doctorId}=await (await post({action:'add_note',content:'Currently taking aspirin.'})).json();
 const {id:patientId}=await (await post({action:'add_note',content:'I stopped aspirin.'},'patient')).json();
 const original=sqlite.prepare('SELECT content FROM care_entries WHERE id=?').get(patientId).content;
 sqlite.prepare('INSERT INTO care_entries (id,clinic_id,patient_id,owner_role,author_id,kind,title,content,source,confidence,patient_visible,raw_ai,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run('ai-conflict','north','patient-1','system','system','ai_patient_session_summary','Synthetic discrepancy','Stopped aspirin.','Test session','unverified',0,1,new Date().toISOString());
 const data=await get();assert.equal(data.conflicts.filter(c=>c.status==='open').length,2);
 for(const c of data.conflicts){assert.equal(c.clinician_entry_id,doctorId);assert.equal(c.clinician_value,'taking');const p=JSON.parse(c.provenance_json);assert.equal(p.clinician.entry_id,doctorId);assert.ok(p.other.quote);}
 const t=await (await top('doctor')).json();assert.ok(t.conflicts.some(c=>c.other_entry_id===patientId));
 const c=data.conflicts.find(c=>c.other_entry_id===patientId);for(const role of ['staff','nurse','patient','admin'])assert.equal((await post({action:'confirm_conflict',conflictId:c.id,reason:'Reviewed source discrepancy'},role)).status,403);
 assert.equal((await post({action:'confirm_conflict',conflictId:c.id,reason:'Reviewed source discrepancy'})).status,200);assert.equal((await post({action:'confirm_conflict',conflictId:c.id,reason:'Reviewed source discrepancy'})).status,409);
 assert.equal(sqlite.prepare('SELECT content FROM care_entries WHERE id=?').get(patientId).content,original);
 assert.deepEqual((await get('patient')).conflicts,[]);assert.deepEqual((await (await top('patient')).json()).conflicts,[]);
});
test('conflict rules are narrow, negation-aware and do not treat generic symptom progression as a contradiction',()=>{
 assert.equal(extractClaims('Not allergic to penicillin. Not currently taking aspirin. Symptoms now occur sooner.').length,0);
 assert.equal(extractClaims('No penicillin allergy.')[0].value,'denied');assert.equal(extractClaims('正在服用二甲双胍。')[0].value,'taking');
});
test('manual discrepancy flags cover unsupported claims and newer clinician notes supersede old detected baselines',async()=>{
 await reset();const {id:d}=await (await post({action:'add_note',content:'Currently taking aspirin.'})).json();const {id:p}=await (await post({action:'add_note',content:'Stopped aspirin.'},'patient')).json();
 assert.equal((await post({action:'flag_conflict',clinicianEntryId:d,otherEntryId:p,reason:'Manual check of wording'},'staff')).status,201);
 const {id:next}=await (await post({action:'add_note',content:'Stopped aspirin.'})).json();sqlite.prepare('UPDATE care_entries SET created_at=? WHERE id=?').run('2098-01-01',next);
 const data=await get();assert.ok(data.conflicts.some(c=>c.claim_key==='medication:aspirin'&&c.status==='superseded'));assert.ok(data.conflicts.some(c=>c.claim_key==='manual'&&c.status==='open'));
});
test('Top Card uses role-scoped projections, rejects unauthenticated reads and refreshes after writes',async()=>{
 await reset();assert.equal((await top('forged')).status,401);
 for(const role of Object.keys(identities)){const r=await top(role);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.match(r.headers.get('server-timing'),/top_card;dur=/);const d=await r.json();assert.equal(d.actorId,identities[role]);assert.equal(d.role,role==='doctor'?'clinician':role);if(['patient','admin'].includes(role)){assert.deepEqual(d.highlights,[]);assert.deepEqual(d.conflicts,[])}else assert.ok(d.highlights.length);}
 await post({action:'highlight_decision',highlightId:'h-language',decision:'accepted'});const data=await (await top('doctor')).json();assert.equal(data.highlights.find(h=>h.id==='h-language').status,'accepted');
});

const {GET:historyGET}=await importSource('app/api/entry-history/route.ts');
const history=(id,role='doctor')=>historyGET(new Request(`https://care.test/api/entry-history?entryId=${id}`,{headers:{cookie:`ng_session=${role}`}}));
test('owning role edits and reverts immutable snapshots; patient history never exposes private versions',async()=>{
 await reset();const created=await (await post({action:'add_note',title:'Private baseline',content:'Internal staff context',patientVisible:false},'staff')).json();
 assert.equal((await post({action:'edit_note',entryId:created.id,expectedVersion:1,title:'Public update',content:'Appointment arranged',patientVisible:true},'staff')).status,200);
 const ph=await (await history(created.id,'patient')).json();assert.deepEqual(ph.versions.map(v=>v.version),[2]);assert.equal(ph.canEdit,false);assert.doesNotMatch(JSON.stringify(ph),/Internal staff context/);
 for(const role of ['doctor','nurse','patient','admin'])assert.equal((await post({action:'edit_note',entryId:created.id,expectedVersion:2,content:'Override'},role)).status,403);
 assert.equal((await post({action:'revert_note',entryId:created.id,expectedVersion:2,targetVersion:1},'staff')).status,200);
 const h=await (await history(created.id,'staff')).json();assert.deepEqual(h.versions.map(v=>v.version),[3,2,1]);assert.equal(h.versions[0].content,'Internal staff context');
 assert.equal((await history(created.id,'patient')).status,403);assert.ok(!(await get('patient')).entries.some(e=>e.event_id===created.id||e.related_entry_id===created.id));
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM audit_events WHERE resource_id=? AND action IN (?,?)').get(created.id,'note.edited','note.reverted').n,2);
});
test('atomic note CAS permits one winner and preserves independent role edits',async()=>{
 await reset();const action={action:'edit_note',entryId:'entry-feb-06',expectedVersion:1,title:'Clinical update',content:'First writer'};
 const responses=await Promise.all([post(action),post({...action,content:'Second writer'})]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 const h=await (await history(action.entryId)).json();assert.equal(h.currentVersion,2);assert.equal(h.versions.length,2);assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='note.edited'").get().n,1);
 const independent=await Promise.all([post({...action,expectedVersion:2,content:'Next clinical version'}),post({action:'edit_note',entryId:'entry-aug-24',expectedVersion:1,title:'Staff update',content:'Referral documents ready'},'staff')]);assert.deepEqual(independent.map(r=>r.status),[200,200]);
 assert.ok((await get('patient')).entries.some(e=>e.kind==='system_event'&&e.related_entry_id==='entry-feb-06'));
});
test('plan CAS prevents concurrent overwrite; revert requires the current version',async()=>{
 await reset();const version=(await get()).plan.version;
 const rs=await Promise.all([post({action:'save_plan',expectedVersion:version,content:'Plan A'}),post({action:'save_plan',expectedVersion:version,content:'Plan B'})]);assert.deepEqual(rs.map(r=>r.status).sort(),[200,409]);
 assert.equal((await post({action:'revert_plan',expectedVersion:version,targetVersion:3})).status,409);
 assert.equal((await post({action:'revert_plan',expectedVersion:version+1,targetVersion:3})).status,200);
 const d=await get();assert.equal(d.plan.version,version+2);assert.equal(d.versions.filter(v=>v.version===version+1).length,1);assert.equal(d.versions.length,4);
});
test('comment status changes retain history and reject stale writes',async()=>{
 await reset();await post({action:'comment',entryId:'entry-feb-06',content:'Internal discussion'},'staff');const c=(await get()).comments[0];
 assert.equal((await post({action:'resolve_comment',commentId:c.id,expectedVersion:1,resolved:true},'nurse')).status,200);
 assert.equal((await post({action:'resolve_comment',commentId:c.id,expectedVersion:1,resolved:false},'staff')).status,409);
 assert.equal((await post({action:'resolve_comment',commentId:c.id,expectedVersion:2,resolved:false},'staff')).status,200);
 assert.deepEqual(sqlite.prepare('SELECT version,resolved FROM comment_versions WHERE comment_id=? ORDER BY version').all(c.id).map(v=>[v.version,v.resolved]),[[1,0],[2,1],[3,0]]);
});
const importBody=(interaction)=>({action:'preview_ai_import',interaction,title:'AI summary awaiting review',summary:'Name: Synthetic Patient, SYNTHETIC_ID, phone SYNTHETIC_PHONE. Activity reduced.',model:'synthetic-fixture',syntheticConsent:true,evidence:[1],messages:[{speaker:interaction==='doctor'?'clinician':interaction==='nurse'?'nurse':'ai',time:'00:00',text:'Tell me about activity.'},{speaker:'patient',time:'00:10',text:'Name: Synthetic Patient, SYNTHETIC_ID, phone SYNTHETIC_PHONE. I stopped evening walks.'}]});
test('three imported AI note types use reviewed redacted payloads, exact evidence and shared safe events',async()=>{
 await reset();for(const interaction of ['doctor','nurse','patient_ai']){
  const body=importBody(interaction),p=await (await post(body)).json();assert.equal(p.status,200);assert.doesNotMatch(JSON.stringify(p.preview),/Synthetic Patient|SYNTHETIC_ID|SYNTHETIC_PHONE/);assert.equal(p.preview.lines[1].match,true);
  assert.equal((await post({...body,action:'import_ai_note',reviewedRedaction:true,previewHash:p.previewHash,summary:'Changed after preview'})).status,400);
  const saved=await post({...body,action:'import_ai_note',reviewedRedaction:true,previewHash:p.previewHash});assert.equal(saved.status,201);const {id}=await saved.json();
  const clinician=(await get()).entries.find(e=>e.id===id);assert.equal(clinician.raw_ai,1);assert.equal(clinician.author_id,'system');assert.equal(clinician.review_status,'review_required');
  const patient=(await get('patient')).entries.find(e=>e.event_id===id);assert.ok(patient);assert.doesNotMatch(patient.content,/Activity reduced/);assert.equal((await history(id,'patient')).status,403);
  const src=sqlite.prepare('SELECT * FROM consult_sources WHERE entry_id=?').get(id);assert.doesNotMatch(JSON.stringify(src),/Synthetic Patient|SYNTHETIC_ID|SYNTHETIC_PHONE/);assert.deepEqual(JSON.parse(src.evidence_json),[1]);assert.match(src.checksum,/^sha256:[a-f0-9]{64}$/);
  const {GET:sourceGET}=await importSource('app/api/transcript/route.ts');const request=()=>sourceGET(new Request(`https://care.test/api/transcript?entryId=${id}`,{headers:{cookie:'ng_session=doctor'}}));assert.equal((await request()).status,403);
  const consent=await (await post({action:'request_transcript',entryId:id,reason:'Review simulated source evidence'})).json();
  if(interaction==='nurse')assert.equal((await post({action:'respond_transcript',requestId:consent.id,decision:'approved'},'nurse')).status,200);
  assert.equal((await post({action:'respond_transcript',requestId:consent.id,decision:'approved'},'patient')).status,200);
  const full=await request();assert.equal(full.status,200);const transcript=await full.json();assert.equal(transcript.lines[1].match,true);assert.equal(transcript.pointer.source_id,src.id);
 }
 for(const role of ['patient','admin','staff'])assert.equal((await post(importBody('doctor'),role)).status,403);
});
test('runtime redaction handles labelled names and IDs; metadata logs exclude free text',async()=>{
 const {prepareModelInput,safeAuditMetadata}=await importSource('lib/privacy.ts');
 const redacted=prepareModelInput('姓名：合成患者。身份证 SYNTHETIC_ID，电话 SYNTHETIC_PHONE; Synthetic Patient; Name: Synthetic Patient, email SYNTHETIC_EMAIL',['Synthetic Patient']);
 assert.doesNotMatch(redacted.text,/合成患者|SYNTHETIC_ID|SYNTHETIC_PHONE|Synthetic Patient|Synthetic Patient|SYNTHETIC_EMAIL/);assert.equal(redacted.requiresHumanReview,true);
 assert.deepEqual(safeAuditMetadata({reason:'private medical text',mention:'@Name',from_version:1,status:'approved'}),{from_version:1,status:'approved'});
 await reset();await post({action:'resolve_highlight',highlightId:'h-chest',reason:'Private completion detail SYNTHETIC_ID'});
 assert.doesNotMatch(JSON.stringify(sqlite.prepare('SELECT metadata FROM audit_events').all()),/Private completion detail|SYNTHETIC_ID/);
});
test('simultaneous consent responses cannot erase another participant decision',async()=>{
 await reset();const request=await (await post({action:'request_transcript',entryId:'entry-aug-18',reason:'Review synthetic nurse encounter'})).json();
 const responses=await Promise.all([post({action:'respond_transcript',requestId:request.id,decision:'rejected'},'nurse'),post({action:'respond_transcript',requestId:request.id,decision:'approved'},'patient')]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);const row=sqlite.prepare('SELECT * FROM transcript_access_requests WHERE id=?').get(request.id);assert.notEqual(row.status,'approved');
 if(row.status==='pending')assert.equal((await post({action:'respond_transcript',requestId:request.id,decision:'rejected'},'nurse')).status,200);
 assert.equal(sqlite.prepare('SELECT status FROM transcript_access_requests WHERE id=?').get(request.id).status,'rejected');
});
