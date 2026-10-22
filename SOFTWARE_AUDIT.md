# CareBridge (Health Track) — Software Audit

|                      |                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **System**           | CareBridge / Health Track: offline-first health access for Buea and surrounding communities, Cameroon                               |
| **Audit type**       | Pre-build scope and design audit (documentation review)                                                                             |
| **Sources reviewed** | `BACKEND_PHASES.md`, `Health Track - Feature List v2.docx` (21 Oct 2026), CareBridge landing page design, `FRONTEND.md`             |
| **Audit date**       | 21 October 2026                                                                                                                     |
| **Build deadline**   | 22 October 2026, 14:00 GMT+1                                                                                                        |
| **Status**           | Design stage. No code has been audited. Findings concern scope, architecture, security, privacy, clinical safety and delivery risk. |

---

## 1. Executive Summary

CareBridge is a Progressive Web App backed by a serverless AWS stack (CDK in Python: Lambda, DynamoDB, S3, Cognito, API Gateway, EventBridge, SNS). It lets people in Buea:

- find and call nearby health facilities with no network,
- run an offline danger-sign triage,
- consult a doctor by text or voice note (including on behalf of someone without a phone),
- pay per consultation through Fapshi mobile money.

It also adds SMS/USSD channels, a nurse callback and operator console, and extended services (appointments, lab tests, blood requests, emergency location share, health tips) in a second tier.

**Overall assessment:** the architecture fits the problem. The offline-first client, the stateless rule engine, idempotent messaging and serverless scale-to-zero suit low-connectivity, low-cost operation. The feature list and backend plan agree closely.

The main risks are:

1. **Schedule:** 40 in-scope features and 11 backend phases inside 24 hours with 6 people.
2. **Clinical safety:** the triage rules are not clinically validated.
3. **Health-data protection:** no explicit retention, consent or encryption policy is defined yet.
4. **Duplicated triage logic:** the rules run both in the browser and in Lambda.
5. **Several gaps:** consultation fee source, anonymous-session abuse, the role of the Admin group, and the doctor onboarding path.

| Rating            | Count |
| ----------------- | ----- |
| 🔴 High           | 7     |
| 🟠 Medium         | 11    |
| 🟢 Low / advisory | 8     |

---

## 2. What the Software Entails

### 2.1 Users and roles

| Role                           | Cognito group                  | Capabilities                                                                           |
| ------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------- |
| Patient                        | `Patient` (default on sign-up) | Profile, household, triage, consult, pay, history, services                            |
| Phone owner (on-behalf)        | `Patient`                      | Creates consultations and triage for household members; their records stay separate    |
| Anonymous user                 | none (`X-Anonymous-Session`)   | Consult and pay without identity for 7 days                                            |
| Doctor                         | `Doctor`                       | Queue, claim, reply (text/voice), prescribe, refer, close, presence                    |
| Operator / staff               | `Operator`                     | Callback queue, emergencies, blood requests, facility search, dispatch log, lab status |
| Admin                          | `Admin`                        | Facility CRUD, health tips curation, appointment confirmation, lab status              |
| Facility / pharmacy (external) | none (public lookup)           | Verify prescription and referral codes                                                 |
| Feature-phone user             | none (SMS/USSD session)        | Triage, nearest hospitals, first aid, nurse callback                                   |

### 2.2 Functional inventory

| #   | Capability                                                         | Tier | Backend phase           | Frontend page(s)          |
| --- | ------------------------------------------------------------------ | ---- | ----------------------- | ------------------------- |
| 1   | PWA install, low-end Android support                               | 1    | 0                       | Shell                     |
| 2   | Offline facility directory (40 seeded facilities)                  | 1    | 2                       | `/app/facilities`         |
| 3   | Facility detail (capabilities, hours, backup power, CSU card, fee) | 1    | 2                       | `/app/facilities/:id`     |
| 4   | One-tap call (`tel:`)                                              | 1    | —                       | Directory, detail, result |
| 5   | Distance sorting on the device (Haversine)                         | 1    | 2                       | Directory                 |
| 6   | Offline write queue and sync                                       | 1    | 4 (`POST /sync`)        | All writes                |
| 7   | Offline triage (~30 rules, 40 symptoms, age-banded)                | 1    | 3                       | `/app/triage`             |
| 8   | RED/AMBER/GREEN routing to facility type                           | 1    | 3                       | Triage result             |
| 9   | Auditable rules-fired log                                          | 1    | 3                       | Result, doctor case       |
| 10  | Account and profile (Cognito Hosted UI)                            | 1    | 1                       | Profile                   |
| 11  | Text consultation (async)                                          | 1    | 4                       | Chat                      |
| 12  | Voice notes both directions (Opus)                                 | 1    | 4                       | Chat, case view           |
| 13  | On-behalf consultation                                             | 1    | 1, 4                    | Household, consult new    |
| 14  | Fapshi pay-per-consultation                                        | 1    | 5                       | Payment                   |
| 15  | Payment webhook → `paid`                                           | 1    | 5                       | —                         |
| 16  | Doctor queue, case view, reply                                     | 1    | 6                       | `/doctor`                 |
| 17  | Seeded Buea dataset                                                | 1    | 2                       | —                         |
| 18  | Shared session engine (web/SMS/USSD)                               | 2    | 8                       | Simulator                 |
| 19  | SMS consultation and triage                                        | 2    | 8                       | `/sim/sms`                |
| 20  | USSD menu                                                          | 2    | 8                       | `/sim/ussd`               |
| 21  | Nurse callback request                                             | 2    | 8                       | Operator                  |
| 22  | Operator console                                                   | 2    | 8                       | `/operator`               |
| 23  | Web push                                                           | 2    | 7                       | Profile, SW               |
| 24  | Consultation history timeline                                      | 2    | 3, 4, 5                 | `/app/consults`           |
| 25  | Available doctors list                                             | 2    | 9                       | `/app/doctors`            |
| 26  | Click-to-call voice (masked callback)                              | 2    | **Not in backend plan** | —                         |
| 27  | Prescription record and code                                       | 2    | 6                       | Case view, `/rx/:code`    |
| 28  | Referral record and code                                           | 2    | 6                       | Case view, `/ref/:code`   |
| 29  | Duplicate-safe messaging                                           | 2    | 4                       | Outbox                    |
| 30  | Map view (Leaflet/OSM)                                             | 2    | —                       | `/app/facilities/map`     |
| 31  | Appointment booking                                                | 2    | 9                       | `/app/appointments`       |
| 32  | Lab test request and home collection                               | 2    | 9                       | `/app/lab-tests`          |
| 33  | Blood availability and request                                     | 2    | 9                       | `/app/blood`              |
| 34  | Emergency location share                                           | 2    | 9                       | `/app/emergency`          |
| 35  | Health tips feed (sourced and dated)                               | 2    | 9                       | `/app/tips`               |
| 36  | Pay for someone else                                               | 2    | 5                       | Payment                   |
| 37  | Receipts and history                                               | 2    | 5                       | `/app/payments`           |
| 38  | Anonymous question mode                                            | 2    | 10                      | `/anon`                   |
| 39  | Priority escalation on reconnect                                   | 2    | 4, 6                    | Doctor queue              |
| 40  | EN / FR / Pidgin                                                   | 2    | 10                      | All                       |

19 roadmap items (Phases 2–4 of the product roadmap) are out of scope and listed in both source documents.

### 2.3 Technical components

| Layer         | Components                                                                                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Client        | React/TS PWA, Workbox service worker, IndexedDB (Dexie), MediaRecorder (Opus), Push API, Leaflet/OSM, i18next                                                                                                                                          |
| Edge / API    | API Gateway REST API, Cognito User Pool authorizer, request validators, CORS                                                                                                                                                                           |
| Compute       | ~60 Python 3.12 Lambda handlers, shared layer (helpers, JWT util, `session_engine`, `pywebpush`)                                                                                                                                                       |
| Data          | 17 DynamoDB tables: Profile, Facility, TriageResult, Consultation, Message, Payment, Prescription, Referral, PushSubscription, Session, CallbackRequest, Appointment, LabRequest, BloodRequest, Emergency, HealthTip, DoctorPresence, AnonymousSession |
| Storage       | S3: VoiceNotesBucket (private, presigned URLs), i18n bucket, deployment bucket                                                                                                                                                                         |
| Events        | EventBridge: `triage.red.synced`, `payment.confirmed`, `message.sent`. SNS operator topic.                                                                                                                                                             |
| Secrets       | Secrets Manager: Fapshi API key and webhook secret, VAPID private key, telco sandbox credentials                                                                                                                                                       |
| Observability | CloudWatch logs (30 days), alarms, X-Ray                                                                                                                                                                                                               |
| Third parties | Fapshi (payments), browser push services, telco SMS/USSD sandbox, OpenStreetMap tiles                                                                                                                                                                  |

### 2.4 Data processed

| Category  | Examples                                                                                                                                  | Sensitivity                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Identity  | Name, phone (E.164), email, DOB, sex                                                                                                      | Personal                                |
| Household | Members' names, DOB, sex, relationship                                                                                                    | Personal, third party, often minors     |
| Health    | Symptoms, vitals, pregnancy status, triage urgency, complaints, chat, voice recordings, prescriptions, referrals, lab results, blood type | **Special category / highly sensitive** |
| Location  | Device geolocation (emergency), quarter                                                                                                   | Sensitive                               |
| Financial | Payment amounts, Fapshi references, payer phone                                                                                           | Personal / financial                    |
| Clinician | Doctor ID, specialty, presence                                                                                                            | Personal (staff)                        |

---

## 3. Findings

### 3.1 Scope and delivery

| ID   | Rating | Finding                                                                                                                                                                | Recommendation                                                                                                                                                       |
| ---- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-01 | 🔴     | 40 features, 11 backend phases and 17 tables in 24 hours with 6 people. The phases also include VPC, PITR, alarms and X-Ray, which add deploy time without demo value. | Freeze to Tier 1 (Phases 0–6). Skip the VPC for the hackathon (Lambdas outside a VPC avoid NAT cost and cold-start delay). Treat Phase 10 housekeeping as post-demo. |
| D-02 | 🟠     | **Click-to-call voice** (feature 26) is in the Tier 2 list but has no backend phase, table or endpoint.                                                                | Add it to a phase (telephony provider, masked number) or move it to the roadmap explicitly.                                                                          |
| D-03 | 🟠     | **Map view** has no backend work but depends on external OSM tile servers, whose usage policy forbids heavy use.                                                       | Use a tile provider with an OSM licence for production, and keep the list fallback.                                                                                  |
| D-04 | 🟢     | Feature-flag strategy is defined in the feature list and frontend spec, but the backend has no flag mechanism.                                                         | Unfinished routes simply aren't deployed. Document that.                                                                                                             |
| D-05 | 🟠     | **Brand mismatch:** the design says _CareBridge_, the documents say _Health Track_.                                                                                    | Decide the public name before the pitch and assets.                                                                                                                  |

### 3.2 Clinical safety

| ID   | Rating | Finding                                                                                                                                                            | Recommendation                                                                                                                                                                                                  |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-01 | 🔴     | Triage rules are **not clinically validated** (stated openly in the feature list). Wrong GREEN results could delay emergency care.                                 | Show "Advisory, not a diagnosis" on every result. Bias rules towards over-triage (RED/AMBER when uncertain). Version every rule. Get clinician sign-off (University of Buea teaching hospital) before real use. |
| C-02 | 🔴     | The rules exist **twice**: in the browser (offline) and in Lambda (`POST /triage`). The two can drift, so the doctor may see a different urgency from the patient. | Use one source of truth: a JSON rule definition consumed by both engines, plus a shared test vector suite run in CI for TS and Python. Store `rules_version` on each result.                                    |
| C-03 | 🟠     | No defined behaviour for a RED result: an async chat could leave a RED patient waiting.                                                                            | For RED, show "call / go now" first and the consultation second. Hold an SLA alert for RED cases that stay unclaimed for more than N minutes.                                                                   |
| C-04 | 🟠     | Prescriptions are issued by code with public lookup, but there is no doctor credential verification (registration with the Cameroon medical council).              | Add verified-doctor onboarding through the Admin group. Show the doctor's registration number on prescriptions.                                                                                                 |
| C-05 | 🟢     | Health tips require a source and date, which is good. There is no review or approval step.                                                                         | Add a `reviewed_by` field.                                                                                                                                                                                      |

### 3.3 Security

| ID   | Rating | Finding                                                                                                                                                                                                               | Recommendation                                                                                                                                   |
| ---- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| S-01 | 🔴     | **Public prescription and referral lookup** by an 8-char Base62 code exposes medication details to anyone who guesses or receives the code. 62⁸ ≈ 2.2×10¹⁴ resists guessing, but the endpoint needs abuse protection. | Rate-limit with API Gateway usage plans or WAF. Return minimum data (medication and status, no patient name). Log lookups.                       |
| S-02 | 🔴     | **Anonymous mode** lets unauthenticated users create consultations with only a client-generated UUID. Risks: spam, queue flooding, and token theft from the device.                                                   | Allow creation only after payment (already gated by `pending_payment`). Rate-limit per IP. Have the server mint the token instead of the client. |
| S-03 | 🟠     | Fapshi webhook: HMAC verification and idempotency are well specified. Timestamp and replay windows are not.                                                                                                           | Reject signatures older than 5 minutes, and check that the amount equals the expected fee.                                                       |
| S-04 | 🟠     | Doctor access is not scoped: any `Doctor` can read any case via `GET /doctor/queue/{id}`.                                                                                                                             | Allow reads only for queue items (paid, unclaimed) or cases claimed by the caller. Audit-log every case view.                                    |
| S-05 | 🟠     | SMS/USSD webhooks are public endpoints with no authentication described.                                                                                                                                              | Verify the gateway signature or IP allow-list.                                                                                                   |
| S-06 | 🟠     | Voice note upload has a 500 KB limit and the Opus type, but presigned PUTs can't enforce size unless conditions are set.                                                                                              | Use a presigned **POST** with a `content-length-range` condition, and validate the mime type after upload.                                       |
| S-07 | 🟢     | CORS is `*` in dev.                                                                                                                                                                                                   | Lock it to the app origins in staging and prod (already planned).                                                                                |
| S-08 | 🟢     | Token storage in the browser.                                                                                                                                                                                         | Keep tokens in memory or session storage. Never put them in `localStorage` or URLs. Use a strict CSP.                                            |
| S-09 | 🟢     | Admin-only facility edits are enforced, but the Admin role has no provisioning process.                                                                                                                               | Make Admin assignment manual only (CLI), with MFA required for Doctor, Operator and Admin.                                                       |

### 3.4 Privacy and data protection

Applicable framework: Cameroon Law No. 2024/017 on personal data protection, plus general medical confidentiality obligations.

| ID   | Rating | Finding                                                                                                                                                                    | Recommendation                                                                                                                                                               |
| ---- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-01 | 🔴     | No **consent, privacy notice or retention policy** is defined for health data, voice recordings or location.                                                               | Add consent at first triage and first consultation, a privacy page, and retention periods (for example, voice notes 1 year then deletion rather than an IA transition only). |
| P-02 | 🔴     | **Offline data on shared phones:** IndexedDB holds triage results, chat and voice blobs for household members. On a shared handset, anyone can read another person's data. | Offer an app PIN or lock option, clear local data on logout, and minimise cached chat history.                                                                               |
| P-03 | 🟠     | Encryption at rest is not explicit.                                                                                                                                        | Enable DynamoDB encryption with a customer-managed KMS key, S3 SSE-KMS, and TLS 1.2+ only.                                                                                   |
| P-04 | 🟠     | Anonymous consultations: the doctor sees "no identifying info", but the complaint text or voice note may identify the person.                                              | Tell the user before recording. Never link an anonymous token to a profile.                                                                                                  |
| P-05 | 🟢     | Household members (often minors) have no own account and no consent of their own.                                                                                          | The phone owner attests consent when adding a member. Record `added_by`.                                                                                                     |

### 3.5 Reliability and offline behaviour

| ID   | Rating | Finding                                                                                                                                   | Recommendation                                                                                         |
| ---- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| R-01 | 🟠     | `POST /sync` is described as processing items "atomically" yet returning per-item results. DynamoDB transactions are capped at 100 items. | Define it as per-item idempotent processing (not one atomic transaction) and cap the batch size at 25. |
| R-02 | 🟠     | Offline-created consultations reference `triage_result_id`s that the server has not created yet.                                          | Use client-generated ULIDs as server IDs, or send a local-to-server ID mapping in the sync response.   |
| R-03 | 🟢     | Cold starts for Lambdas in a VPC on the doctor queue path.                                                                                | Keep Lambdas outside a VPC, or use provisioned concurrency for queue and messages.                     |
| R-04 | 🟢     | Seeded facility data accuracy (phones, hours) affects patient safety directly.                                                            | Record `verified_at` and a source for each facility, plus a "Report incorrect info" action.            |

### 3.6 Payments

| ID   | Rating | Finding                                                                              | Recommendation                                                                                                |
| ---- | ------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| F-01 | 🟠     | The consultation fee source is undefined: neither a table nor a config value exists. | Add a fee config (global or per doctor) in SSM Parameter Store. The server sets the amount, never the client. |
| F-02 | 🟢     | No refund or cancellation path exists, for example when no doctor answers.           | Define an SLA and a manual refund process for the pilot.                                                      |

### 3.7 Accessibility, inclusion and localisation

| ID   | Rating | Finding                                                                                | Recommendation                                                                         |
| ---- | ------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| A-01 | 🟠     | Pidgin has no standard orthography, and machine translation is unreliable.             | Use native-speaker translations. Prioritise triage and USSD strings (already planned). |
| A-02 | 🟢     | Voice notes are the main low-literacy aid. The doctor-side transcript is roadmap only. | Accepted. Keep icon-plus-text UI and large targets.                                    |

---

## 4. Requirement Traceability Check

| Check                                          | Result                                                               |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| Every Tier 1 feature has a backend phase       | ✅                                                                   |
| Every Tier 2 feature has a backend phase       | ⚠️ Click-to-call voice is missing (D-02). Map view needs no backend. |
| Every backend endpoint has a frontend consumer | ✅ (see `FRONTEND.md` §6). `POST /push/send` is internal.            |
| Every data model has an owner Lambda           | ✅                                                                   |
| Roadmap items are excluded from the build      | ✅ consistent across both documents                                  |
| Rule coverage documentation exists             | ⏳ Planned as a Phase 3 output                                       |

---

## 5. Risk Register (top 10)

| Rank | Risk                                                 | Likelihood | Impact    | Mitigation                                                       |
| ---- | ---------------------------------------------------- | ---------- | --------- | ---------------------------------------------------------------- |
| 1    | Tier 1 not finished by 14:00                         | High       | High      | Scope freeze, drop VPC/alarms, flags                             |
| 2    | Unsafe triage output                                 | Medium     | Very high | Over-triage bias, advisory labels, clinician sign-off            |
| 3    | Browser and server rule drift                        | Medium     | High      | Single JSON rule source and shared test vectors                  |
| 4    | Health data exposure on a shared device              | High       | High      | Lock, logout wipe, minimal cache                                 |
| 5    | Fapshi sandbox or webhook unreachable during demo    | Medium     | High      | Recorded fallback, manual "mark paid" admin switch in dev only   |
| 6    | Anonymous or public endpoint abuse                   | Medium     | Medium    | Rate limits and WAF                                              |
| 7    | Doctor over-access to cases                          | Medium     | High      | Claim-scoped access, audit log                                   |
| 8    | Inaccurate facility data                             | Medium     | High      | `verified_at`, report-an-error                                   |
| 9    | Push notifications unsupported (iOS without install) | High       | Low       | In-app polling fallback                                          |
| 10   | SMS/USSD remain simulated                            | Certain    | Medium    | Stated openly. Swapping in a live gateway is configuration only. |

---

## 6. Recommendations Summary (prioritised)

1. Freeze to Tier 1. Remove the VPC and housekeeping from the hackathon path.
2. Make one JSON triage rule set feed both engines, with a shared test suite and `rules_version`.
3. Add consent, privacy notice, retention and KMS encryption before any real patient data.
4. Scope doctor reads to queue or claimed cases, and audit-log every case view.
5. Rate-limit public endpoints (`/rx`, `/ref`, `/anon`, webhooks). Verify the SMS/USSD gateway signature.
6. Have the server set the fee amount, and validate the amount and timestamp in the Fapshi webhook.
7. Add a device-lock option and a logout wipe for shared phones.
8. Plan the missing click-to-call phase, or move it to the roadmap.
9. Settle the public brand name.

---

## 7. Sign-off

| Role             | Name | Date | Signature |
| ---------------- | ---- | ---- | --------- |
| Technical lead   |      |      |           |
| Clinical advisor |      |      |           |
| Product owner    |      |      |           |
