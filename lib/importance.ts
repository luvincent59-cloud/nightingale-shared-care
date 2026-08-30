// Interpretable online preference ranking. No LLM training or clinical inference.
export const MODEL_VERSION = "importance-v2";
export const teamRoles = ["clinician", "nurse", "staff"];
export type Suggestion = {
  id: string; entry_id: string; entity_key: string; label: string; meta: string;
  severity: string; risk_reason: string; provenance_pointer: string;
  status: string; created_at: string; resolved_at: string | null;
  [key: string]: unknown;
};
export type Signal = { entity_key: string; actor_role: string; signal: string; value: number; created_at: string };

export function rankSuggestions(items: Suggestion[], signals: Signal[], role: string, clock = Date.now()) {
  return items.map(item => {
    const age = Math.max(0, (clock - Date.parse(item.created_at)) / 86400000);
    const recency = Math.round(20 * Math.exp(-age / 30));
    const unresolved = item.resolved_at ? 0 : 25;
    const risk = item.severity === "high" ? 35 : item.severity === "medium" ? 20 : 5;
    const related = signals.filter(s => s.entity_key === item.entity_key);
    const explicit = related.filter(s => s.signal === "accept" || s.signal === "reject_relevance");
    // Beta-style shrinkage to neutral with four prior observations.
    const preference = Math.round(20 * explicit.reduce((n, s) => n + s.value, 0) / (explicit.length + 4));
    // Behaviour is weak evidence, decays in 30 days, and is personalised by role.
    const attention = related.filter(s => ["comment", "mention", "assign", "complete"].includes(s.signal));
    const support = attention.reduce((n, s) => n + s.value * (s.actor_role === role ? 1 : .25) * Math.exp(-Math.max(0, (clock - Date.parse(s.created_at)) / 86400000) / 30), 0);
    const behaviour = Math.round(4 * support / (support + 4));
    const safetyPinned = item.severity === "high" && !item.resolved_at;
    const score = Math.max(0, Math.min(100, risk + recency + unresolved + preference + behaviour));
    const components = { risk, recency, unresolved, preference, behaviour };
    return { ...item, final_score: score, learned_boost: preference + behaviour, signal_count: related.length,
      safety_pinned: safetyPinned, components_json: JSON.stringify(components), model_version: MODEL_VERSION,
      why: `${item.risk_reason}. ${item.resolved_at ? "Completed" : "Still open"}; source ${Math.floor(age)} day(s) old. Learned adjustment ${preference + behaviour >= 0 ? "+" : ""}${preference + behaviour} from ${related.length} signal(s).`,
    };
  }).sort((a, b) => Number(b.safety_pinned) - Number(a.safety_pinned) || Number(Boolean(a.resolved_at)) - Number(Boolean(b.resolved_at)) || b.final_score - a.final_score || a.id.localeCompare(b.id));
}

export function candidateForNote(entry: { id: string; title: string; content: string }) {
  const text = `${entry.title} ${entry.content}`.toLowerCase();
  const entity = /interpreter|mandarin|language|翻译|普通话/.test(text) ? "language_preference"
    : /ecg|troponin|lipid|心电|检查/.test(text) ? "cardiac_testing"
    : /chest|胸/.test(text) ? "exertional_chest_pain" : "care_followup";
  // Only a review candidate; keywords do not establish medical risk or diagnosis.
  return { entity, label: `Review new note: ${entry.title}`, reason: "New information awaiting care-team review", severity: "low" };
}
