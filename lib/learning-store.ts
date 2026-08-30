import { env } from "cloudflare:workers";
import {conflictData} from "./conflicts";
import type { Actor } from "./auth";
import { rankSuggestions, candidateForNote, teamRoles, MODEL_VERSION, type Suggestion, type Signal } from "./importance";
const now = () => new Date().toISOString();

function insertSuggestion(id: string, clinic: string, patient: string, entry: string, entity: string, label: string, severity: string, reason: string, pointer: object, created: string) {
  return env.DB.prepare("INSERT OR IGNORE INTO highlight_suggestions (id,clinic_id,patient_id,entry_id,entity_key,label,meta,severity,risk_reason,provenance_pointer,components_json,base_score,status,model_version,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, clinic, patient, entry, entity, label, "Review suggestion · completion tracked separately", severity, reason, JSON.stringify(pointer), "{}", 0, "pending", MODEL_VERSION, created);
}

export async function seedImportance() {
  await env.DB.batch([
    insertSuggestion("h-chest", "north", "patient-1", "entry-aug-26", "exertional_chest_pain", "Exertional chest pressure increasing", "high", "Reported symptom frequency increased; urgent review remains open", {entry_id:"entry-aug-26",source_id:"NC-4821",span:"08:21–08:45",version:1}, "2026-08-26T09:42:00Z"),
    insertSuggestion("h-ecg", "north", "patient-1", "entry-aug-24", "cardiac_testing", "Missing ECG order and lipid panel", "medium", "Missing documents are blocking the cardiology referral", {entry_id:"entry-aug-24",source_id:"entry-aug-24",field:"content",quote:"Latest lipid panel and ECG order are still missing.",version:1}, "2026-08-24T16:18:00Z"),
    insertSuggestion("h-language", "north", "patient-1", "entry-aug-24", "language_preference", "Mandarin interpreter preferred", "low", "Patient-stated language preference is relevant to the next visit", {entry_id:"entry-aug-24",source_id:"entry-aug-24",field:"content",quote:"Patient prefers morning appointments and needs Mandarin interpretation.",version:1}, "2026-08-24T16:18:00Z"),
    ...[
      ["task-ecg", "entry-aug-24", "h-ecg", "Obtain ECG order", "dr-samuel-lee"],
      ["task-call", "entry-aug-26", null, "Call patient with safety-net instructions", "mei-tan"],
      ["task-lipid", "entry-aug-24", "h-ecg", "Attach latest lipid panel", "priya-nair"],
    ].map(([id,entry,highlight,label,assignee]) => env.DB.prepare("INSERT OR IGNORE INTO care_tasks (id,clinic_id,patient_id,entry_id,highlight_id,label,assignee,completed,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(id,"north","patient-1",entry,highlight,label,assignee,0,now())),
    // Preserve clinician review decisions recorded by earlier prototype versions.
    env.DB.prepare("UPDATE highlight_suggestions SET status=(SELECT decision FROM highlight_feedback f WHERE f.highlight_id=highlight_suggestions.id AND f.clinic_id=highlight_suggestions.clinic_id ORDER BY f.id DESC LIMIT 1),reviewed_by=(SELECT actor_id FROM highlight_feedback f WHERE f.highlight_id=highlight_suggestions.id AND f.clinic_id=highlight_suggestions.clinic_id ORDER BY f.id DESC LIMIT 1),reviewed_at=(SELECT created_at FROM highlight_feedback f WHERE f.highlight_id=highlight_suggestions.id AND f.clinic_id=highlight_suggestions.clinic_id ORDER BY f.id DESC LIMIT 1) WHERE status='pending' AND EXISTS(SELECT 1 FROM highlight_feedback f WHERE f.highlight_id=highlight_suggestions.id AND f.clinic_id=highlight_suggestions.clinic_id AND f.decision IN ('accepted','rejected'))"),
  ]);
}

export function noteSuggestion(entry: {id:string;title:string;content:string}, actor: Actor, created: string) {
  const c = candidateForNote(entry);
  return insertSuggestion(`h-${entry.id}`,actor.clinicId,"patient-1",entry.id,c.entity,c.label,c.severity,c.reason,{entry_id:entry.id,source_id:entry.id,field:"content",version:1},created);
}

// One weak signal per actor/entity/type/day: repeated clicks cannot train the ranker.
export async function entrySignals(actor: Actor, entryId: string, signal: string) {
  if (!teamRoles.includes(actor.role)) return [];
  const entities = await env.DB.prepare("SELECT DISTINCT entity_key FROM highlight_suggestions WHERE clinic_id=? AND patient_id=? AND entry_id=?").bind(actor.clinicId,"patient-1",entryId).all<{entity_key:string}>();
  const created = now();
  return entities.results.map(({entity_key}) => env.DB.prepare("INSERT OR IGNORE INTO learning_signals (id,clinic_id,patient_id,entity_key,entry_id,actor_id,actor_role,signal,value,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind(`${actor.clinicId}:${actor.id}:${entity_key}:${signal}:${created.slice(0,10)}`,actor.clinicId,"patient-1",entity_key,entryId,actor.id,actor.role,signal,1,created));
}

export async function importanceData(actor: Actor) {
  if (!teamRoles.includes(actor.role)) return {highlights:[],highlightHistory:[],learningProfile:[]};
  const rows = await env.DB.prepare("SELECT h.*,e.created_at FROM highlight_suggestions h JOIN care_entries e ON e.id=h.entry_id AND e.clinic_id=h.clinic_id AND e.patient_id=h.patient_id WHERE h.clinic_id=? AND h.patient_id=?").bind(actor.clinicId,"patient-1").all<Suggestion>();
  const signals = await env.DB.prepare("SELECT entity_key,actor_role,signal,value,created_at FROM learning_signals WHERE clinic_id=?").bind(actor.clinicId).all<Signal>();
  const conflicts=(await conflictData(actor)).filter(c=>c.status!=="superseded");
  const ranked = rankSuggestions(rows.results, signals.results, actor.role).map(h=>{
    const conflict=conflicts.find(c=>c.other_entry_id===h.entry_id);
    return conflict?{...h,label:`Conflicting report: ${h.label}`,why:`Clinician source ${conflict.clinician_entry_id} takes precedence. ${conflict.status==="open"?"Human confirmation required.":"Clinician confirmed."} ${h.why}`,provenance_pointer:JSON.stringify({...JSON.parse(h.provenance_pointer),preferred_clinician_entry_id:conflict.clinician_entry_id,conflict_id:conflict.id})}:h;
  });
  return {
    highlights: ranked.filter(h => !h.resolved_at && (h.status !== "rejected" || h.safety_pinned)),
    highlightHistory: ranked.filter(h => h.resolved_at || h.status === "rejected" && !h.safety_pinned),
    learningProfile: [{model:MODEL_VERSION,signal_count:signals.results.length,scope:"Clinic feedback + role-specific behaviour",method:"Online preference ranking; no LLM retraining"}],
  };
}

export async function reviewSuggestion(actor: Actor, highlightId: string, decision: string, reason: string) {
  if (actor.role !== "clinician") return {error:"forbidden",status:403};
  if (!["accepted","rejected"].includes(decision) || decision === "rejected" && !["not_relevant","inaccurate","duplicate"].includes(reason)) return {error:"Select a valid decision and rejection reason",status:400};
  const item = await env.DB.prepare("SELECT * FROM highlight_suggestions WHERE id=? AND clinic_id=? AND patient_id=?").bind(highlightId,actor.clinicId,"patient-1").first<Suggestion>();
  if (!item) return {error:"Highlight not found",status:404};
  const created=now(), signal=decision === "accepted" ? "accept" : reason === "not_relevant" ? "reject_relevance" : "reject_correction";
  // Pending-state predicates and one atomic batch prevent duplicate reviews and learning.
  const result = await env.DB.batch([
    env.DB.prepare("INSERT INTO highlight_feedback (highlight_id,clinic_id,actor_id,decision,created_at) SELECT id,clinic_id,?,?,? FROM highlight_suggestions WHERE id=? AND clinic_id=? AND status='pending'").bind(actor.id,decision,created,highlightId,actor.clinicId),
    env.DB.prepare("INSERT OR IGNORE INTO learning_signals (id,clinic_id,patient_id,entity_key,entry_id,actor_id,actor_role,signal,value,created_at) SELECT ?,clinic_id,patient_id,entity_key,entry_id,?,?,?,?,? FROM highlight_suggestions WHERE id=? AND clinic_id=? AND status='pending'").bind(`review:${highlightId}`,actor.id,actor.role,signal,decision === "accepted" ? 1 : signal === "reject_relevance" ? -1 : 0,created,highlightId,actor.clinicId),
    env.DB.prepare("INSERT INTO audit_events (clinic_id,actor_role,actor_id,action,resource_id,metadata,created_at) SELECT clinic_id,?,?,?,?,?,? FROM highlight_suggestions WHERE id=? AND clinic_id=? AND status='pending'").bind(actor.role,actor.id,`highlight.${decision}`,highlightId,JSON.stringify({reason,signal,model:MODEL_VERSION}),created,highlightId,actor.clinicId),
    env.DB.prepare("UPDATE highlight_suggestions SET status=?,reviewed_by=?,reviewed_at=?,review_reason=? WHERE id=? AND clinic_id=? AND status='pending'").bind(decision,actor.id,created,reason || null,highlightId,actor.clinicId),
  ]);
  return result[0].meta.changes ? {ok:true,status:200} : {error:"Highlight already reviewed",status:409};
}
