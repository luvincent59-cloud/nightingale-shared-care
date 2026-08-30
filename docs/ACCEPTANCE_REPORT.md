# Challenge acceptance audit - 27 August 2026

Scope: the complete 13-image challenge specification supplied by the user, plus the subsequent privacy, consent, role and no-paid-cloud requirements. This report distinguishes runtime evidence from intended architecture. Do not describe the prototype as production-ready or every bonus as implemented.

| Requirement | Implemented evidence / remaining qualification |
|---|---|
| Ten-second glance | Three compact cards first, severity + short reason + direct source; details reveal score and clinical actions. Actual clinician usability timing has not been measured. |
| Chronological shared Timeline | Canonical IDs, server-safe patient projections, three AI types, human notes and saved-edit/revert system events; 4-second/focus sync. |
| Doctor-patient / nurse-patient / AI-patient AI notes | Distinct system-authored types and source sessions; seeded examples plus a real controlled import workflow. Not a live summarization model. |
| AI separated and traceable | AI/Human filters, explicit origin/review badges; source entry/version and exact transcript evidence; human consent gates full chat. |
| Collaboration | Internal comments, mentions, assignment and task state; comments resolve/reopen with version snapshots. |
| Version history and revert | Ordinary role-owned notes and Care Plan: full snapshots, comparison, revert-as-new-version. Patient history excludes prior private versions. |
| Concurrent editing | Atomic conditional updates + guarded dependent writes; competing note/plan writes yield one success and one 409. Unsaved drafts remain in the editor. |
| Changes since X | User-selected date/time filters actual created/updated records; Activity and Admin counts use persisted data instead of examples. |
| Clinician priority on conflict | Both sources retained, clinician-preferred basis and open flag; clinician-only confirmation. Limited EN/ZH patterns, manual flags for unsupported contradictions. |
| Staff cannot impersonate Clinician | Real API tests for body/author/type, URL/header roles, forged sessions and cross-role edits. |
| Clinician cannot impersonate Staff | Real API tests for forged authors/roles/types, comment attribution and cross-role edits. |
| Patient cannot access internal comments | Empty safe reads, explicit read/write/resolve denial; no canary leakage. |
| Patient cannot access raw AI notes | Safe projections only, explicit raw/history access denied; transcript consent does not grant raw-AI-note access. |
| Clinic scope and Admin | Runtime scope tests; clinic read-only oversight, no clinical actions/full chat. One synthetic clinic/patient implemented. |
| Full chat consent | Server-derived participants; nurse correctly Mei Tan; all humans approve, 24-hour expiry; optimistic updates prevent lost simultaneous responses. |
| PHI handling | Runtime redaction preview masks selected names/IDs/phones/emails before local processing/persistence; preview hash prevents changed payload bypass. Rules incomplete; synthetic-only. No external LLM. |
| Audit metadata | Actual events, allowlisted metadata, no freeform clinical reason logging; append-only through app APIs, not administrator-proof. |
| TLS / encryption | Managed HTTPS hosting. Production at-rest encryption, key rotation and backup assurance need provider evidence; not independently audited here. |
| P95 <=300ms | Reproducible local approximation: 5,000 requests, 30 concurrent, 10,005 entries, P95 37.63-39.22ms, zero failures. Online/browser P95 unmeasured. Brief defines measurement and limitations. |
| Self-learning bonus | Durable clinician relevance feedback + deduplicated weak role behavior; recent/open priority, urgent safety pin; no fine-tuning or validated medical ranking. |
| Hybrid storage bonus | Role-safe synthetic manifest and proposed tiered architecture. No actual external encrypted history package or retrieval. |
| Ambient voice bonus | Optional browser single-speaker dictation/manual fallback, text provenance and limited EN/ZH glossary. No validated noisy ASR, diarization, automatic code switching or stored audio. |

## Verification

- 31 actual TypeScript handler tests pass using the SQLite D1 adapter.
- 19 separate Python reference microtests pass; the four requested filenames are retained.
- 9 SQL migrations applied successfully to local D1, including the new note/comment snapshots and consult sources.
- TypeScript check and lint pass. Production build and 6 bundle/component checks are verified in the release workflow.
- PDF brief has 3 pages and was rendered and visually inspected.
- No live browser, production load or acoustic-quality test was performed.

```sh
npm ci
npm run db:local
npm run test:runtime
npm run lint
npm test
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests
node scripts/benchmark-top-card.mjs --local
```

`npm test` builds before checking bundle/component output. The Sites release checkpoint is the publication build gate; rerunning `test:ui` afterward avoids a duplicate build. Raw benchmark samples are versioned in `docs/top-card-local-benchmark.json`.

## Submission items still needing the candidate

1. Record the actual demo video; `DEMO_SCRIPT.md` is a script, not a video.
2. Supply resume, WhatsApp and WeChat information; none is fabricated in this repository.
3. Confirm reviewer access to the site and source repository. Existing sharing was not broadened; knowing an in-app demo password does not bypass the site's visitor access gate.
4. If claiming online/browser <=300ms, perform the target-region measurement described in the brief. The challenge allows a stated approximation; do not relabel local figures as online results.
5. Review production and bonus limitations before presenting them as completed functionality.
