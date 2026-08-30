# Nightingale Shared Care
Technical Brief | Synthetic challenge prototype | 27 August 2026

## 1. Shared record, human authority

The first viewport answers three questions: what needs attention, why, and where is the evidence? Compact priority cards show severity, a short reason and review status. A direct source link clears filters; selecting the card opens the full explanation and clinician controls. Accepting an AI suggestion is separate from completing the work. Urgent unresolved flags cannot be suppressed by learned preference or rejection.

The implementation is React/Vinext on a Cloudflare Worker with D1 persistence. It has five separately authenticated synthetic roles: Patient, Staff, Nurse, Clinician and Admin. Server-resolved identity and clinic scope govern every protected read/write; client role fields cannot grant authority. Staff and clinicians cannot edit each other's notes. Patients receive safe projections, never internal comments or raw clinical AI notes. Admin has clinic oversight without clinical write authority or full-chat access.

### Records and provenance

The deployed schema uses care_entries, note_versions, timeline_projections, comments/comment_versions, care_plans/plan_versions, record_events and audit_events. One canonical event ID connects the authorised views. Patient-facing text is an explicit projection, not a raw note hidden with CSS. Patient-visible writes update source and projection in the same D1 transaction. Four-second polling plus focus refresh provides quick convergence, not guaranteed real-time transport.

Three system-authored types distinguish doctor-patient, nurse-patient and AI-patient summaries. All display AI origin and review status. The import workflow accepts an existing synthetic AI summary, role-tagged messages, timestamps and evidence indices; it does not run a language model. Source text and the summary pass through redaction preview, and only the reviewed payload is stored. Imported model labels remain unverified. Patient views show a shared encounter receipt until safe clinical conclusions are supplied.

Seed sources are server-only transcripts; imported sources live in consult_sources; original dictation text is separate in voice_records. Provenance identifies the entry, source and version or evidence span. Old highlights resolve to their original snapshot after edits. Full-chat requests require every human participant's approval, expire after 24 hours and are rejected on any refusal. AI is exempt. Approvals use conditional updates so simultaneous responses cannot overwrite one another. Returned transcript SHA-256 is a content fingerprint, not an independently signed authenticity guarantee.

### Versions and conflicts

Owning-role edits and reverts write full snapshots. A revert creates a new version. Atomic UPDATE predicates compare expectedVersion; a unique mutation ID guards downstream snapshot, projection, audit and change-event writes in the same batch. One competing writer succeeds, the other receives 409 and retains its draft. Different role-owned records can change independently. Care Plan and comment resolve/reopen also use version checks. Snapshots are append-only through APIs, not tamper-proof against privileged database operators.

Limited EN/ZH patterns detect explicit medication/allergy disagreement against the newest clinician statement; other discrepancies can be manually flagged. Clinician content takes precedence while both sources and a human-review flag remain. Only Clinician can confirm. This is a bounded discrepancy detector, not exhaustive clinical reasoning.

<!-- PAGE BREAK -->

## 2. Learning, privacy and storage

### Feedback-adaptive importance

highlight_suggestions, highlight_feedback and learning_signals persist candidate state, explicit review and weak behaviour. The score is risk (35/20/5), recency (20 x exp(-age_days/30)), open work (25), explicit preference and weak support, bounded to 0-100. Recency uses source time, not click time. Urgent open items sort first before scores are compared.

Explicit preference is round(20 x (accepts - relevance_rejects) / (accepts + relevance_rejects + 4)). It transfers within the same clinic/topic to future candidates. Incorrect/duplicate rejection preserves correction history without teaching that the clinical topic is unimportant. Acceptance never grants transcript access or resolves a task.

Comments, mentions, assignments and completions by Staff/Nurse/Clinician are weaker evidence. Signals are deduplicated per actor/topic/type/day, decay, and contribute at most four points. Views, inactivity and repeated clicking are not labels. Every card explains its ranking and source. Patient/Admin do not receive the internal ranking ledger. This is online preference learning, not LLM retraining or validated triage. Future evaluation needs clinician-labelled precision@3/NDCG, urgent-case recall, role-level bias checks, poisoning monitoring and model rollback.

### Privacy boundary and operational limits

lib/privacy.ts masks configured or labelled names, selected national IDs, phones and emails. AI import and reviewed voice text use this boundary before local processing; import requires an unchanged, explicitly reviewed redacted preview. No outbound LLM or paid cloud speech API is configured. Unknown unlabelled names can escape these rules. Synthetic-only use and human inspection are mandatory; real deployment needs clinical NER, DLP/quarantine and a verified pre-network redaction boundary.

Audit metadata uses an allowlist of identifiers, versions and controlled fields, not free-form note/review text. Clinical reasons remain in restricted records. Runtime tests inspect logs for leakage. Failed access creates account/Admin alerts. The demo uses HttpOnly sessions with fixed synthetic credentials and salted SHA-256 checks; production requires an identity provider/MFA, a suitable password KDF, hardened abuse controls and independent security review. HTTPS is hosted transport; production encryption/key rotation, retention, backups and disaster recovery require provider assurance and configuration. No database RLS or certification is claimed.

Browser dictation is optional, single-speaker and explicitly consented. The browser/OS may send audio to its own vendor even though the app configures no paid API. Manual text fallback is labelled. EN/ZH glossary matches preserve text offsets and flag possible negation/units for review. No audio is stored. Noise-resistant speaker isolation, diarization, automatic code-switching and validated medical ASR are not implemented.

### Long-history architecture

The proposed policy keeps 0-2 years expanded, 2-7 years as annual summaries and older material as a capsule. D1 holds manifest, per-role projection and summary versions; production would retain immutable encrypted originals in object storage with checksums and authorised audited retrieval. Current Compressed History is explicitly a synthetic manifest demonstration. Example counts/checksums/pointers are not proof of a connected cold store; the prototype does not delete source records or claim retrievable decade-long packages.

<!-- PAGE BREAK -->

## 3. Performance and acceptance evidence

### P95 target and implemented path

Target: warm Top Card P95 <=300 ms. /api/top-card is fetched independently of Timeline and reads a bounded, precomputed D1 projection keyed by clinic, patient and role after session validation. It returns at most 12 highlights and 12 open conflicts, without LLM or history aggregation on the warm path. Writes rebuild projections; Timeline sync refreshes data older than 60 seconds. Missing projections are recomputed and labelled cold. Responses are private/no-store. Cold and full-login latency are separate metrics.

HTTP timing starts immediately before fetch and ends after JSON decoding/validation. Server-Timing reports handler work only. Browser instrumentation records fetch-to-second-requestAnimationFrame after React commit in window.__ngTopCardMetrics and performance.measure('ng.top_card.<role>'). That approximates a paint opportunity, not a display timestamp. Authentication, initial navigation and JS download precede this boundary. Cancelled/background-tab samples must be identified rather than hidden.

### Reproducible approximation

Run node scripts/benchmark-top-card.mjs --local. This exercises the actual handler through loopback HTTP with Node SQLite as a D1 adapter: 10,005 synthetic entries, 100 warm-ups per role, 30 concurrent requests and 1,000 measured requests per role. The 27 August run on Node 24.19 lasted 3.03 seconds with no failures or cold samples. Raw samples and environment are in docs/top-card-local-benchmark.json.

Local HTTP P95 (ms): Clinician 37.63; Staff 37.91; Nurse 39.22; Patient 38.06; Admin 38.21. The local approximation passes. Deployed D1/network/browser P95 has NOT been measured and is not claimed to pass.

Compute nearest-rank P95 as sorted[ceil(0.95 x N) - 1], per role; do not average percentiles. Report N, p50/p95/p99, errors/timeouts and warm/cold counts. Errors fail the gate separately. For remote HTTP, use the same script with NG_BENCH_URL and authorised NG_BENCH_SESSIONS supplied securely, never committed. It stores timings, not cookies or clinical bodies. For browser acceptance, use foreground target-region sessions, record device/browser/network and release, warm up, collect representative write/read traffic and export metrics. A recommended stronger run is 30 sessions for 10 minutes with at least 1,000 samples per role. Report cold/full-login results separately.

### Verification and submission

The actual TS handlers pass 31 tests via node --test tests/self-learning.test.mjs. Coverage includes both Staff/Clinician impersonation directions, patient comment/raw-AI denial, clinic isolation, three note types, consent, conflict precedence, redacted imports, note/plan concurrent writes, history visibility and reverts. Six bundle/component checks run after build. The 19 Python tests remain a distinct reference suite, including the four specifically requested microtest filenames. All nine SQL migrations were applied to local D1. See docs/ACCEPTANCE_REPORT.md for the final build/test record.

Implemented scope is a single synthetic patient/clinic demo, not an EHR integration. Timestamp changes and Activity now derive from persisted events. Required review still includes the actual demo video, resume and WhatsApp/WeChat details supplied by the candidate, and reviewer access to site/source. Site sharing is unchanged; in-app credentials do not bypass site-level access. A verified three-page brief, reproducible setup, Git history and package/model attribution are supplied. No claim of complete production readiness or all bonus features is made.
