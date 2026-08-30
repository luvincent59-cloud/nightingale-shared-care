# Nightingale Shared Care

Synthetic care-record prototype: compact priorities, a shared Timeline with server-enforced role projections, three explicit AI note types, provenance, full-chat consent and version history. **Not a clinical product; use simulated data only. No paid cloud AI API is configured.**

## Local setup

Node.js 22.13+ (tested with 24.19), npm, and Python 3.11+ for optional reference tests. The Sites build helper uses GNU `timeout`; use Linux/WSL or provide that utility.

```sh
npm ci
npm run db:local
npm run dev
```

`db:local` applies the tracked Drizzle SQL migrations to a local D1 emulator, never remote storage. The local configuration and Vite binding use the same placeholder database ID and `.wrangler/state` persistence. Initial synthetic records are seeded on the first authenticated read. Existing deployments apply the packaged migrations through Sites. `npm run db:generate` generates future migrations; it does not apply them.

```sh
npm run test:runtime
npm run lint
npm test
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests
node scripts/benchmark-top-card.mjs --local
```

`npm test` runs the actual TS handler tests, builds, then checks the client bundle and rendered components. During Sites publication, checkpoint supplies the build gate; run `npm run test:ui` afterward without rebuilding. Python microtests are a separate reference model, not a substitute for shipped API tests. Their required filenames include `test_rbac_scope.py`, `test_revision_history.py`, `test_highlight_provenance.py`, `test_concurrent_edits.py`.

## Synthetic accounts

| Role | Username | Password |
|---|---|---|
| Patient | maya.patient | DEMO_PASSWORD_SHARED_SEPARATELY |
| Staff | priya.staff | DEMO_PASSWORD_SHARED_SEPARATELY |
| Nurse | mei.nurse | DEMO_PASSWORD_SHARED_SEPARATELY |
| Clinician | samuel.clinician | DEMO_PASSWORD_SHARED_SEPARATELY |
| Admin | alice.admin | DEMO_PASSWORD_SHARED_SEPARATELY |

Each authenticates separately. Server-issued HttpOnly sessions determine identity; clients cannot choose a role through request fields. These deliberately published demo credentials and salted SHA-256 checks are **not production identity management**. Replace with an identity provider, MFA and a password KDF before real use. Site-level visitor sharing is separate from in-app accounts.

## Walkthrough

1. Open a compact priority card for why, score contributions and review; its direct source link clears Timeline filters. Older source versions open history. Clinician Accept/Reject changes ranking, not task completion or transcript consent.
2. In Timeline, choose AI scribed or Human notes. Every AI entry is marked and points to a source. Select Changes since to filter actual creation/modification times.
3. Add a note, open **History / edit**, change it, compare snapshots and revert. Only the owning role can edit. The server atomically checks `expectedVersion`; stale writes return 409 and the editor retains the draft. Care Plan and comment resolve/reopen also have version protection.
4. Use **Import AI summary** for doctor-patient, nurse-patient or AI-patient output. Supply role-tagged source messages, times and evidence indices. Review the redacted preview, then import. This stores an existing summary; it does not invoke a summarization model. All imported clinical summaries remain unreviewed AI output, authored by System.
5. Request full chat access. All human participants must approve within 24 hours; AI is exempt. A shared event appears in patient and team Timelines, while the raw clinical note remains private. Imported sources retain only the redacted text. Original dictation drafts stay separately protected.
6. Activity shows real metadata events; Admin statistics query the current clinic and its record viewer is read-only. Fake activity/count examples have been removed.

## Security and privacy

`app/api/*` and `lib/revisions.ts` enforce authentication, clinic/patient scope and role ownership. Staff cannot edit clinician notes, and clinicians cannot edit staff notes. Patient payloads exclude internal comments, raw AI notes and private historical snapshots. Admin cannot write clinical content or open full chats. Record + snapshot + safe projection + audit + change event commit in one D1 batch. Version predicates and unique mutation IDs prevent losing writers from appending false snapshots or audits. This is application-level authorization; no Postgres RLS is claimed.

`lib/privacy.ts` masks configured/labelled names, selected national IDs, phones and email in the AI-import processing payload and reviewed voice text before local extraction. Imported text is persisted only after a matching redacted preview is confirmed. No outbound LLM exists. These deterministic rules are deliberately incomplete: unknown unlabelled names may remain, so manual review and synthetic-only use are mandatory. A future LLM integration must invoke the boundary before any network call and add clinical NER/DLP. Audit metadata uses controlled fields, not note text or free-form review reasons. Clinical reasons remain in restricted clinical records.

Snapshots are append-only through application APIs, not cryptographically tamper-proof against database administrators. HTTPS is managed hosting; storage encryption and production key/retention policy need provider configuration and independent assurance. No claim of production security certification is made.

## Bonuses and honest limits

The ranker persists clinician feedback plus deduplicated weak staff/nurse/clinician behavior; recent, incomplete work rises, urgent open flags remain pinned. It is explainable preference learning, not LLM fine-tuning or validated triage. The limited EN/ZH conflict detector preserves clinician precedence with a human-review flag; unsupported discrepancies can be manually flagged.

Voice note uses optional browser speech or manual text fallback, with explicit consent/review and local EN/ZH term extraction. It is not guaranteed offline and does not implement diarization, noise-resistant patient isolation, automatic code switching, audio upload or validated medical accuracy.

Compressed History is clearly labelled a **synthetic manifest/architecture demonstration**. Its example counts, checksums and storage pointers are not proof of a retrievable encrypted archive. No external cold store is connected and no original records are deleted by this feature.

Warm `/api/top-card` reads bounded role projections independently from Timeline. Latest reproducible local HTTP metrics are in `docs/top-card-local-benchmark.json`; they approximate the performance requirement. Production/browser P95 is unmeasured. See the 3-page `output/pdf/technical-brief.pdf`, editable `TECHNICAL_BRIEF.md`, `docs/ACCEPTANCE_REPORT.md`, `DEMO_SCRIPT.md`, and `ATTRIBUTION.txt`.
