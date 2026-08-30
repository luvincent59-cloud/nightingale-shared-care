# Demo script (4–5 minutes)

## 0:00–0:30 — Frame the problem

“EHRs have plenty of notes but no shared patient story. I designed this around one trust question: can a clinician understand what changed, act, and verify the AI in ten seconds?” Mention that all data is synthetic.

Start with the red `FLAG · URGENT`: name the risk reason and same-day action, then contrast it with the amber action risk. Explain that color never stands alone—the severity text, reason, and next action remain visible.

## 0:30–1:30 — Glance and provenance

Open Synthetic Patient. Point out the critical signal, action, and preference. Read only the bold lines. Click **Exertional chest pressure increasing → View source**. Show the exact timeline entry, AI label, consult identifier, confidence, and “source for selected highlight” banner.

Click **Request / open full chat**. Explain that the summary and typed provenance point are immediately available, while the full conversation stays server-side. Send the consent request, sign in as Synthetic, and Accept it in the Timeline Consent Inbox. Return as Dr. Lee and open the transcript. Point out that the AI participant did not need to consent, while Synthetic did, and that the view is audited.

Compare the doctor and patient views of `entry-aug-26`. Both show the same Shared Event ID and timestamp. The doctor sees the clinical AI draft; Synthetic sees a clinician-reviewed patient-safe projection. Keep both sessions open in separate browser profiles if available and show the Live sync time updating within four seconds or immediately when the tab regains focus.

Scroll to **Compressed history** and open **Inspect integrity**. Show the 2014–2023 role-safe capsule, 37 original events, 96 source revisions, four role projections, checksum, immutable archive-summary versions, and full-history pointer. State clearly: “This is a synthetic manifest and architecture demonstration. No external cold store or history-package retrieval is connected; the feature does not delete the current source records.”

Say: “A highlight is a reviewable claim, not truth. It stores a reason and an evidence pointer.” Accept it, then reject another suggestion to demonstrate human control and the learning signal.

## 1:30–2:20 — Collaboration and permissions

Point out comments, mentions, assignments, and open tasks. Switch to **Patient** and show that raw AI and staff-internal notes disappear. State clearly: “This switch demonstrates the views; security itself is server-side. The tested policy layer scopes every record by clinic and role before access.”

## 2:20–3:10 — Version history and conflict safety

Switch back to Clinician. Open **Care plan**, edit a sentence, and save. Show the incremented version. Revert to v3 and note that revert creates a new version rather than deleting history. Explain optimistic concurrency: different role-owned sections do not collide; stale edits to the same section return a deterministic conflict.

## 3:10–4:00 — Longitudinal context and learning

Return to Timeline. Contrast February's isolated episode with this week's increasing frequency and unresolved referral. Explain the transparent score: recency, risk, unresolved task, clinical entity, and learned preference. Clinician feedback changes future ranking, never the medical record or safety rules.

## 4:00–4:30 — Architecture and close

Show the three-page technical brief. Demonstrate the redaction preview and bounded glance projection. Report local HTTP P95 37.6–39.2 ms, explicitly not an online/browser result. Close by summarising source traceability, human review and preserved history.


## Bonus: feedback-adaptive priority ranking

1. Sign in as Clinician. Click a compact top card to open its details, then expand **How this was ranked**. Explain its source date, open state, risk and learned adjustment; the score is not diagnostic confidence.
2. Accept an unreviewed preference suggestion. Refresh: the decision and learned weight survive. Accept is not Complete.
3. Add a new note mentioning the same topic (for example Mandarin interpreter). The new rule-assisted review candidate inherits topic feedback and has its own source pointer.
4. Reject another candidate with “not relevant”; compare its negative relevance adjustment in history. “Incorrect”/“duplicate” rejects do not train negative relevance.
5. Sign in as Staff, comment or assign a follow-up; then sign in as Nurse (`mei.nurse` / `DEMO_PASSWORD_SHARED_SEPARATELY`) and mention a colleague. These weak signals are role-weighted and deduplicated by day. Neither role can Accept/Reject.
6. Complete the ECG order as Clinician and lipid-panel task as Staff. The linked document highlight leaves the open list only after both are done. Reopen one task to bring it back.
7. Reject an urgent suggestion if still pending: the unresolved safety flag stays at the top. Only a clinician can record its clinical completion with a reason.
8. Sign in as Patient: internal suggestions, score details and learning feedback are absent; transcript consent is unchanged.

The implementation demonstrates persistent online preference ranking, not automatic LLM retraining or a clinically validated prioritisation model.

## No-paid-API voice demo

1. As Patient, open **Voice note**, choose English or Mandarin and accept the single-speaker simulated-data consent.
2. Start listening, dictate a short note, then Stop. If the browser lacks speech support, explicitly choose **Manual / pasted transcript** (this is a fallback, not a recognition demonstration).
3. Check the original transcript, correct drug names/units/negation in the review area, inspect local keyword matches and confirm review.
4. Save and inspect the new Timeline event. The patient's and clinician's views share the same event ID and retain AI origin labeling where browser recognition was used.
5. As Clinician, request the original dictation source. As Patient, accept in the Consent Inbox; return to Clinician to inspect original versus corrected text and its checksum.
6. No audio is stored; no noisy-environment accuracy or target-speaker separation is claimed. The saved source points to text positions.

## Revised acceptance walkthrough

- Add a Staff note, edit it through History / edit, then revert. Show versions 1, 2 and 3 and the corresponding Activity events. Sign in as Clinician and demonstrate read-only history for that Staff note.
- Use two independently authenticated Clinician sessions to edit the same note or plan; save one, then show the stale-write error and retained draft in the other.
- Import one clearly marked synthetic AI summary. Show redaction preview, evidence index, AI origin and the patient shared-event receipt. Do not present this as live model generation.
- Select Changes since and show actual saved changes. Show Admin's real counts and read-only clinic records.
- Demonstrate the four required negative API tests using test output; hidden buttons alone are not proof of server RBAC.
- Before submission, provide a recorded video, resume and WhatsApp/WeChat details and confirm reviewer site/repository access.
