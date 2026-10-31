# CareBridge / Health Track: Backend Feature Map (for the frontend redesign)

> Written 2026-10-22 from reading the **actual code** in `Backend/health_track/` (CDK stacks and Lambda handlers), not the plan in `Backend/BACKEND_PHASES.md`. Where the code and the plan disagree, this file follows the code and says so.

---

## 1. What the product is

CareBridge (internal name **Health Track**) is an **offline-first health access PWA** for Buea and the surrounding communities in Cameroon. People with weak or no connectivity can:

1. Find and call nearby health facilities (40 seeded Buea facilities, distance sorted on the device).
2. Run a **danger-sign triage** (RED / AMBER / GREEN) that works offline and is re-checked by the server.
3. **Consult a doctor asynchronously** by text or voice note, for themselves or **on behalf of** a household member without a phone.
4. **Pay per consultation** with Fapshi mobile money (also for someone else).
5. Receive prescriptions and referrals as **short public codes** that a pharmacy or facility can look up.

Tier 2 services: SMS/USSD channel, nurse callback queue, operator console, appointments, lab tests, blood requests, emergency location share, health tips, doctor presence, anonymous consultations, and EN / FR / Pidgin strings.

### Roles (Cognito groups)

| Role | How it is assigned | What they do |
|---|---|---|
| **Patient** | Automatically on sign-up (post-confirmation trigger) | Profile, household, triage, consult, pay, extended services |
| **Doctor** | **Staff pool.** Created when an Admin approves a doctor application (§3.13) | Queue, claim, reply, prescribe, refer, close, presence heartbeat |
| **Operator** | **Staff pool.** Created by CLI (`Backend/RUNBOOK.md` §5) | Nurse callbacks, dispatch log, emergencies, blood requests, lab status |
| **Admin** | **Staff pool.** Created by CLI | Facility CRUD, health tips CRUD, confirm appointments, lab status, **review doctor applications** |
| **Anonymous** | No account: `X-Anonymous-Session` header | Consult and pay without identity (7-day session) |
| **Public** | No auth | Facilities, health tips, Rx/referral code lookup, VAPID key, i18n |
| **Feature phone** | SMS/USSD webhook | Menu: hospitals, first aid, symptom check, nurse callback |

---

## 2. Architecture at a glance

- **IaC:** AWS CDK (Python), entry `Backend/app.py`. 14 stacks named `HealthTrack-<Name>-<env>` (`env` = `dev` | `staging` | `prod`, from `-c env=`).
- **Compute:** Python 3.12 Lambdas, one per route. Shared layer at `Backend/lambda_layers/common/python/health_track_common/` (`response.ok/err`, `auth.require_group`, `anonymous`, `locale`, `fapshi`, `rules`).
- **Data:** DynamoDB tables named `HealthTrack-<Table>-<env>`. S3 for voice notes and i18n JSON.
- **Auth:** **two** Cognito user pools, both accepted by the API authorizer:
  - **Patient pool:** self sign-up; only the `Patient` group; optional TOTP; 1 h tokens and a 30-day refresh token.
  - **Staff pool** (Doctor, Operator, Admin): no self sign-up; **TOTP mandatory**; **10-minute tokens**; a **24-hour session** (the refresh token rotates on every refresh but never extends past 24 h after sign-in).

  Staff screens must use the staff pool's authority and client ID (`HealthTrack-Auth-<env>` outputs `StaffCognitoAuthority`, `StaffAppClientId`, `StaffHostedUiDomain`).

  Patient pool details: Hosted UI (OAuth code flow + PKCE), email or phone sign-in. API Gateway uses a **Cognito User Pools authorizer**, so the frontend must send the **ID token** as `Authorization: Bearer <id_token>` (it already does: `Frontend/src/auth/session.ts`).
- **Dev conveniences:** in `dev`, sign-ups are auto-confirmed, Fapshi is **not called** (fake sandbox URL), and the webhook skips signature checks.

### Unified API (current main)

`Backend/health_track/api_stack.py` declares one API Gateway for all HTTP domains. Set `VITE_API_BASE_URL` from its deployment output. Per-service `VITE_API_URL_*` values remain optional overrides, including `I18N` and `DOCTOR_APPLICATION`. The old per-stack API inventory has been superseded. See [FRONTEND_BACKEND_COVERAGE.md](FRONTEND_BACKEND_COVERAGE.md) for current wiring.

### Conventions every response follows

- Success: JSON body, `200` (reads, updates) or `201` (creates). DynamoDB numbers come back as plain JSON numbers.
- Error: `{ "error": "<message>" }` with `400` / `401` / `403` / `404` / `409` / `500` / `503`. The frontend's `ApiError` already reads `error`.
- IDs are UUID v4 strings (the plan says ULID; the code uses `uuid4`). Facility IDs are `<13-hex-ms>-<12-hex>`.
- Timestamps are **epoch milliseconds**, except anonymous `expires_at` and emergency `ttl`, which are epoch **seconds**.
- List endpoints usually return `{ "<plural>": [...], "count": n }`.
- Anonymous endpoints echo `Content-Language`.

---

## 3. Endpoint catalogue

Legend: 🔓 public · 🔑 any signed-in user · 👤 owner only · 🩺 Doctor · 🎧 Operator · 🛠 Admin · 🕶 anonymous session header.

### 3.1 Profile (`profile` API): Phase 1

| Method & path | Auth | Request body | Response |
|---|---|---|---|
| `GET /profile` | 🔑 | – | `Profile` (404 if the post-confirmation trigger never created it) |
| `PUT /profile` | 🔑 | `{ display_name?, locale? ("en"\|"fr"\|"pid") }` | `{ updated: string[] }` |
| `POST /profile/household` | 🔑 | `{ name, dob, sex, relationship }` (all required) | the new `HouseholdMember` (`member_id` is a UUID). Max 10 members. |
| `DELETE /profile/household/{member_id}` | 🔑 | – | `{ deleted: member_id }` |

`Profile` = `{ user_id, email, phone, display_name, locale, on_behalf_profiles: HouseholdMember[], created_at }`. **`date_of_birth` and `sex` are in the plan but cannot be set through the API**; `PUT` accepts only `display_name` and `locale`.

### 3.2 Facilities (`facility` API): Phase 2

| Method & path | Auth | Request | Response |
|---|---|---|---|
| `GET /facilities` | 🔓 | query: `region`, `capability`, `has_backup_power`, `accepts_csu_card` (`"true"`/`"false"`), `last_key` | `{ facilities: Facility[], next_key: string\|null }`, 50 per page |
| `GET /facilities/{facility_id}` | 🔓 | – | `Facility` (404 if inactive) |
| `POST /facilities` | 🛠 | `name, region, quarter, address, phone, latitude, longitude` required; `capabilities[], opening_hours, has_backup_power, accepts_csu_card, consultation_fee_xaf` optional | `201 Facility` |
| `PUT /facilities/{facility_id}` | 🛠 | any of the fields above plus `is_active` | updated `Facility` |

Capabilities: `maternity, emergency, laboratory, pharmacy, blood_bank, x_ray` (plus whatever an admin adds). The `capability` filter runs **after** paging, so a page can hold fewer than 50 items even when more pages exist. Distance sorting is done **on the device** (Haversine); the server does no geo work. Seed data: `Backend/scripts/seed_facilities.py`, mirrored in `Frontend/src/data/facilities.seed.json`.

### 3.3 Triage (`triage` API): Phase 3

| Method & path | Auth | Request | Response |
|---|---|---|---|
| `POST /triage` | 🔑 | `{ symptoms: string[] (required), age_months?: number (default 999 = adult), is_pregnant?: bool, vitals?: { resp_rate? }, on_behalf_member_id?, queued_at? (ms) }` | `201 TriageResult` |
| `GET /triage` | 🔑 | – | `{ results: TriageResult[], count }`, newest first, max 50 |
| `GET /triage/{result_id}` | 👤 | – | `TriageResult` (403 if not yours) |

`TriageResult` = `{ result_id, user_id, urgency, recommendation, facility_type_needed ("emergency"|"general"|"pharmacy"), rules_fired: [{ rule_id, description, urgency, value_that_triggered }], symptom_payload, on_behalf_member_id, synced_from_offline, created_at }`.

Rules (about 38) live in `Backend/health_track/lambdas/triage/rules/` and are mirrored, byte for byte, in the layer (`health_track_common/rules`) and **in TypeScript** in `Frontend/src/triage-engine/`:
- `child_under_5.py`: runs when `age_months <= 60`. Age-banded fast breathing (≤2 months ≥60/min, 2–12 months ≥50, 1–5 years ≥40) plus danger signs.
- `obstetric.py`: runs only when `is_pregnant`. Codes `ob_*` (haemorrhage, convulsion, prolonged labour, no fetal movement = RED; fever, severe headache, swelling, breathing = AMBER).
- `adult_red_flags.py`: always runs.
- The highest urgency fired wins; no rule fired means GREEN.

**Decision already made:** the backend result is the source of truth. The client shows its local result instantly, then replaces it with the server's.

### 3.4 Consultations and messaging (`consultation` API): Phase 4

| Method & path | Auth | Request | Response |
|---|---|---|---|
| `POST /consultations` | 🔑 | `{ complaint (required), triage_result_id?, urgency?, on_behalf_member_id?, patient_id? }` | `201 Consultation`, status `pending_payment` |
| `GET /consultations` | 🔑 | – | Patient: own (by `patient_id`). Doctor: `paid` + `open`. `{ consultations, count }` |
| `GET /consultations/{id}` | 👤 or 🩺 | – | `{ consultation, messages[] }` (messages oldest first) |
| `POST /consultations/{id}/messages` | 🔑 | `{ content_type: "text"\|"voice_note", text_body?, voice_note_key?, duration_seconds?, client_message_id? }` | `201 Message`; replaying a `client_message_id` returns the original with `200` |
| `POST /consultations/{id}/voice-note-upload-url` | 🔑 | `{}` | `{ upload_url, voice_note_key }`: presigned S3 PUT, 5 min, `audio/opus` |
| `GET /consultations/{id}/voice-note/{message_id}` | 👤 or 🩺 | – | `{ download_url, expires_in: 300 }` |
| `POST /sync` | 🔑 | `{ triage_results: [{ result_id, symptom_payload, on_behalf_member_id?, queued_at }], messages: [{ consultation_id, message_id, client_message_id, content_type, text_body?, voice_note_key?, duration_seconds?, created_at, sender_role }] }` | `{ synced: true, has_red_triage: bool, results: { triage_results: [{result_id,status}], messages: [{message_id, status: "ok"\|"duplicate"\|"error"}] } }` |

`Consultation` = `{ consultation_id, patient_id, phone_owner_id, on_behalf_member_id, triage_result_id, complaint, status, urgency, doctor_id, created_at, updated_at, urgency_created }`.
`Message` = `{ consultation_id, message_id, sender_id, sender_role ("patient"|"doctor"), content_type, text_body, voice_note_key, duration_seconds, client_message_id, created_at }`.

**Consultation lifecycle:** `pending_payment` → (Fapshi webhook) `paid` → (doctor claims) `open` → (doctor closes) `closed`.

Voice note flow: ① request an upload URL, ② `PUT` the blob to S3 with `Content-Type: audio/opus`, ③ post a message with `content_type: "voice_note"` and the returned `voice_note_key`, ④ the listener asks for a download URL per message.

There is **no realtime channel** (no WebSocket). The current UI polls every 15–20 s; web push is designed to nudge (see 3.7).

### 3.5 Payments (`payment` API): Phase 5

| Method & path | Auth | Request | Response |
|---|---|---|---|
| `POST /payments/initiate` | 🔑 | `{ consultation_id (required), phone, redirect_url, amount_xaf? (default 2000) }` | `201 { payment_id, payment_url, fapshi_ref }`. Only when the consultation is `pending_payment`. |
| `GET /payments` | 🔑 | – | `{ payments, count }`: payments **you paid** (`payer_id`), newest first |
| `GET /payments/{payment_id}` | payer or patient | – | `Payment` (receipt in `receipt_data` once confirmed) |
| `POST /payments/webhook` | 🔓 (Fapshi; HMAC `x-fapshi-signature` outside dev) | Fapshi payload `{ transId, status: "successful", amount, payer: { phone } }` | `{ acknowledged: true }`. Sets Payment to `confirmed` and Consultation to `paid`, idempotently. |

`Payment` = `{ payment_id, consultation_id, payer_id, patient_id, amount_xaf, fapshi_ref, status ("initiated"|"confirmed"|"failed"), receipt_data: { reference, amount, timestamp, payer_phone }, created_at, confirmed_at }`.

"Pay for someone else" works because anyone signed in can initiate a payment for any `pending_payment` consultation. The payer and the patient are stored separately.

**In `dev` nothing ever confirms a payment**: `payment_url` is a fake `https://fapshi.com/pay/sandbox/...`. To move a consultation to `paid` during a demo, POST the webhook yourself:
```bash
curl -X POST "$PAYMENT_API/payments/webhook" -H 'Content-Type: application/json' \
  -d '{"transId":"sandbox-<first 8 chars of payment_id>","status":"SUCCESSFUL","amount":2000}'
```

### 3.6 Doctor queue and case management (`doctor` API): Phase 6

| Method & path | Auth | Request | Response |
|---|---|---|---|
| `GET /doctor/queue` | 🩺 | – | `{ queue: Consultation[], count }`: `paid` + `open`, ordered RED → AMBER → GREEN → none, then oldest first. Anonymous cases are redacted. |
| `GET /doctor/queue/{id}` | 🩺 | – | `{ consultation, messages, triage_result \| null }` (case view with the full rule audit) |
| `PUT /doctor/queue/{id}/claim` | 🩺 | – | `{ consultation_id, doctor_id, status: "open" }`; `409` unless the status is `paid` |
| `PUT /consultations/{id}/close` | 🩺 | – | `{ consultation_id, status: "closed" }`; `409` unless `open` |
| `POST /consultations/{id}/prescription` | 🩺 | `{ medication_details (required), instructions? }` | `201 { code, consultation_id }`: 8-character Base62 code |
| `POST /consultations/{id}/referral` | 🩺 | `{ target_facility_id (required), reason? }` | `201 { code, consultation_id }` |
| `GET /prescriptions/{code}` | 🔓 | – | `Prescription` `{ code, consultation_id, doctor_id, patient_id, medication_details, instructions, issued_at, status }` |
| `GET /referrals/{code}` | 🔓 | – | `Referral` `{ code, ..., target_facility_id, reason, issued_at, status }` |

Doctors reply through the **consultation** API's `POST /consultations/{id}/messages`; the server sets `sender_role` to `doctor` from the group claim.

### 3.7 Web push (`push` API): Phase 7

| Method & path | Auth | Request | Response |
|---|---|---|---|
| `GET /push/vapid-public-key` | 🔓 | – | `{ vapid_public_key }` (`503` if not configured) |
| `POST /push/subscribe` | 🔑 | `{ endpoint, keys: { p256dh, auth } }` (**top level**, not wrapped) | `{ subscribed: true }` |
| `DELETE /push/subscribe` | 🔑 | – | `{ unsubscribed: true }` |
| *(internal)* `post_send` Lambda | EventBridge | `{ detail: { user_id, payload: { title, body } } }` | sends the push; deletes the subscription on 410 |

EventBridge rules for `payment.confirmed` and `message.sent` are wired to `post_send`, but **no handler publishes those events yet** (see §5).

### 3.8 Multi-channel and operator console (`channel` API): Phase 8

| Method & path | Auth | Request | Response |
|---|---|---|---|
| `POST /channels/sms` | 🔓 (telco webhook) | `{ from, text }` | `{ response, state }` |
| `POST /channels/ussd` | 🔓 (gateway webhook) | `{ phoneNumber, sessionId, text }` | `{ response, state, is_final }` |
| `GET /operator/callbacks` | 🎧 | – | `{ callbacks, count }`: pending, oldest first |
| `PUT /operator/callbacks/{request_id}/handle` | 🎧 | `{ note? }` | `{ request_id, status: "handled" }` (`409` if already handled) |
| `POST /operator/dispatch-log` | 🎧 | `{ facility_id (required), note?, urgency? }` | `201 { log_id }` |

Session state machine (`lambdas/channel/session_engine.py`): `INIT → MENU → {1 FACILITY | 2 FIRST_AID | 3 TRIAGE_Q1 → TRIAGE_Q2 → TRIAGE_DONE | 4 CALLBACK_CONFIRM → CALLBACK_DONE}`. Typing `MENU` returns to the menu from anywhere. Option 4 + `YES` creates a nurse callback (urgency is always `AMBER`). The facility lookup only echoes the area name; it does not search. Sandbox only: nothing sends real SMS. A **phone simulator page** in the web app is the natural way to demo it.

`GET /operator/facilities` from the plan was **not built**; use `GET /facilities?capability=…&region=…` instead.

### 3.9 Extended services (`extended` API): Phase 9

| Method & path | Auth | Request | Response |
|---|---|---|---|
| `POST /appointments` | 🔑 | `{ facility_id, slot_date ("YYYY-MM-DD", today or later), slot_label ("morning"\|"afternoon"\|"evening"), note? }` | `201 Appointment` (status `requested`) |
| `GET /appointments` | 🔑 | query `status?` | Own appointments. An **Admin** with `?status=` gets all appointments in that status. `{ appointments, count }` |
| `DELETE /appointments/{id}` | owner or 🛠 | – | the cancelled `Appointment` |
| `PUT /appointments/{id}/confirm` | 🛠 | – | the confirmed `Appointment` (`409` unless `requested`) |
| `POST /lab-requests` | 🔑 | `{ test_type, facility_id, collection_address?, payment_id? }` | `201 LabRequest` (status `requested`) |
| `GET /lab-requests` | 🔑 | – | **own** lab requests `{ lab_requests, count }` |
| `GET /lab-requests/{id}` | owner or 🎧/🛠 | – | `LabRequest` |
| `PUT /lab-requests/{id}/status` | 🎧/🛠 | `{ status, result_summary? }` | the updated `LabRequest`. Strict order: `requested → sample_collected → results_ready → delivered`; `result_summary` only with `results_ready`. |
| `POST /blood-requests` | 🔑 | `{ requesting_facility_id, blood_type ("A+"…"O-"), units (1–20), urgency }` | `201 BloodRequest` + `blood_bank_facilities: [{facility_id,name,phone}]` |
| `GET /blood-requests` | 🎧 | – | pending requests, by urgency then age `{ blood_requests, count }` |
| `POST /emergency` | 🔑 | `{ latitude, longitude, triage_result_id? }` | `201 { emergency_id, user_id, latitude, longitude, triage_result_id, timestamp, ttl, alert_sent }`. Publishes to the SNS operator topic; expires after 24 h. |
| `GET /operator/emergencies` | 🎧 | – | live (unexpired) emergencies, newest first `{ emergencies, count }` |
| `GET /health-tips` | 🔓 | query `locale?`, `tag?`, `limit?` (1–50, default 20), `next_token?` | `{ tips, count, next_token? }` (active only) |
| `POST /health-tips` | 🛠 | `{ title, body, source_name, published_date (YYYY-MM-DD), locale, source_url?, tags?, is_active? }` | `201 HealthTip` |
| `PUT /health-tips/{tip_id}` | 🛠 | any subset of the fields above | the updated `HealthTip` |
| `DELETE /health-tips/{tip_id}` | 🛠 | – | `{ deleted: tip_id }` |
| `PUT /doctor/presence` | 🩺 | `{ specialty?, typical_response_minutes? }` | `{ doctor_id, last_seen, specialty, typical_response_minutes, is_online: true }`. Heartbeat: call it every few minutes. |
| `GET /doctors/available` | 🔑 | – | doctors seen in the last 5 min, fastest first `{ doctors, count }` |

### 3.10 Anonymous mode (`anonymous` API): Phase 10

All routes are public at the gateway; each handler checks the `X-Anonymous-Session: <uuid>` header itself.

| Method & path | Request | Response |
|---|---|---|
| `POST /anonymous/session` | – | `201 { session_token, expires_at (epoch s, +7 days) }`. **The server mints the token; store it.** |
| `POST /anonymous/consultations` | `{ complaint (≤2000 chars), urgency?, triage_result_id? }` | `201 Consultation` |
| `GET /anonymous/consultations` | – | `{ consultations, count }` |
| `GET /anonymous/consultations/{id}` | – | `{ consultation, messages }` |
| `POST /anonymous/consultations/{id}/messages` | `{ text_body (≤4000), client_message_id? }`. **Text only, no voice notes.** | `201 Message` |
| `POST /anonymous/payments/initiate` | `{ consultation_id, amount_xaf?, phone?, redirect_url? }` | `201 { payment_id, payment_url, fapshi_ref }` |

Doctors see anonymous cases as `patient_id: "anonymous"`, `is_anonymous: true`, with no triage result attached.

### 3.11 i18n (`i18n` API): Phase 10

`GET /i18n/{locale}` 🔓, where `locale` is `en`, `fr` or `pid`. Returns the raw translation JSON from S3 with `Cache-Control` of 7 days and an `ETag` (`If-None-Match` gives `304`). Seed files: `Backend/scripts/i18n/{en,fr,pid}.json`, uploaded by `Backend/scripts/seed_i18n.py`.

### 3.12 Auth triggers (no HTTP)

- **Pre sign-up:** auto-confirms in `dev`.
- **Post confirmation** (patient pool only): creates the profile row and adds the user to the `Patient` group.
- **Patient Hosted UI:** callback `http://localhost:5173/auth/callback`, logout `http://localhost:5173/sign-in`. **Add the deployed frontend URL to `cdk.json` before you deploy the frontend anywhere.**
- **Staff Hosted UI:** its own domain (`StaffHostedUiDomain`), scopes `openid email profile`. Cognito itself runs the whole first sign-in: email + temporary password → new password → QR code for an authenticator app → 6-digit code → tokens. After that, every sign-in asks for email + password + code.
  - Tokens last 10 min. Renew them silently with the refresh token through the OAuth token endpoint; `oidc-client-ts` `automaticSilentRenew` does this. **Store the new refresh token each time**, because the old one stops working 10 s after rotation.
  - When a refresh fails (24 h after sign-in), send the user to sign in again.

### 3.13 Doctor applications (Waspito-style doctor sign-up)

A doctor **has no account until an Admin approves the application**. "Sign up as a doctor" is a public form, not a Cognito sign-up.

**Applicant flow (all 🔓, throttled):**

1. `POST /doctor-applications/uploads` reserves an application and returns one upload form per document.
   - Request: `{ "documents": { "onmc_certificate": "application/pdf", "onmc_card": "image/jpeg", "medical_degree": "application/pdf", "identity_document": "image/png", "selfie_with_ids": "image/jpeg" } }`.
   - All five keys are required. The first four accept `application/pdf`, `image/jpeg` or `image/png`. **`selfie_with_ids` accepts only `image/jpeg` or `image/png`:** it is a photo of the applicant holding their CNI or passport and their ONMC card next to their face.
   - Response: `201 { application_id, expires_in: 900, uploads: { <doc_type>: { url, fields } } }`.
2. Upload each file **with a multipart form POST**, not a PUT. Send it to `uploads[doc].url`, with every entry of `uploads[doc].fields` as form fields **first** and then the file as the field named `file`.
   - The `Content-Type` you send must match the type you declared in step 1. Files can be at most **5 MB**.
   - S3 answers `204`. The forms expire after 15 minutes; if they do, start again at step 1.
3. `POST /doctor-applications` submits the application. The request carries:
   - `application_id`, from step 1;
   - `full_name`, `email`, `phone` (`+237…`, international format);
   - `specialty` (the 21 values in `Frontend/src/api/types.ts`);
   - `onmc_number`, in the form `12345/2019` (registration number / year of first inscription);
   - `medical_school` and `graduation_year` (integer);
   - `identity_document_type` (`cni` | `passport`) and `identity_document_number`.

   Response: `201 { application_id, status: "pending" }`.

   | Error | Meaning |
   |---|---|
   | `400` | The message names the field or document, e.g. `"selfie_with_ids is not a valid JPEG file"` or `"identity_document has not been uploaded"` |
   | `409` | The application was already submitted, or the email is already in use. The email case always gets one generic message on purpose, so the form can't be used to discover staff accounts. |
   | `503` | The review queue is full (200 applications waiting). Show the message and ask the applicant to try again later. Step 1 can also return this. |

4. Show the "under review, usually within 24 hours" card, and **show the application ID** with a link to the status page. Until a domain is configured, the "received" and "rejected" emails are not sent (`Backend/PENDING_BEFORE_DEPLOY.md`).
5. `GET /doctor-applications/{application_id}` → `{ application_id, status, submitted_at, reviewed_at, rejection_reason }`. `status` is one of `pending`, `under_review`, `approving` (the account is being created; show it as "being approved"), `approved` or `rejected`.
6. On approval, Cognito emails the doctor a temporary password and the staff sign-in link. The first sign-in then goes as in §3.12.

**Admin review (🛠, staff pool):**

| Method & path | Request | Response |
|---|---|---|
| `GET /admin/doctor-applications?status=pending` | `status`: `pending` (default), `under_review`, `approving`, `approved` or `rejected` | `{ applications, count }`, newest first, without document keys |
| `GET /admin/doctor-applications/{id}` | – | Full application, plus `document_urls` (`<doc_type>` → link valid for 5 minutes; fetch again to refresh) and `duplicates: { onmc_number: [{application_id, status}], email: [...] }`. Also `duplicate_onmc: true` when the ONMC number was already used when the application was submitted. **Show duplicates prominently: they are the main sign of a stolen identity.** |
| `PUT /admin/doctor-applications/{id}` | `{ admin_notes? (≤2000), checks?: { onmc_register_verified?, documents_consistent?, selfie_matches? } }` (booleans) | `{ updated, status: "under_review", checks }`. The first edit moves the application to `under_review`. Returns `409` once it is decided. |
| `POST /admin/doctor-applications/{id}/approve` | `{}` | `{ approved, email }`. Returns `409` unless **all three checks are true**, and also if another application with the same ONMC number is already approved or this one is already decided. The application first moves to `approving`, and only then is the account created; after that, reject and edit are refused. If approve fails part-way (a `500`), the application stays `approving` and **the admin just presses Approve again**. |
| `POST /admin/doctor-applications/{id}/reject` | `{ reason }` (1–500 chars, shown to the applicant) | `{ rejected }`. A rejected application's documents are deleted 90 days after they were submitted. |
| `POST /admin/doctor-applications/{id}/resend-invite` | `{}` | `{ resent }`. Use it when the 7-day temporary password expired or the email got lost. Returns `409` if the doctor has already signed in or the application isn't approved. |

Checklist wording for the review screen:

- `onmc_register_verified`: "ONMC number found in the Order's register under this name".
- `documents_consistent`: "Name and photo match across CNI/passport, ONMC card, certificate and degree".
- `selfie_matches`: "Selfie shows the same person holding both cards, and the cards are readable".

---

## 4. Data model cheat sheet

| Table | PK / SK | GSIs | Notes |
|---|---|---|---|
| Profiles | `user_id` | – | household in `on_behalf_profiles` |
| Facilities | `facility_id` | RegionIndex, CapabilityIndex (`primary_capability`) | |
| TriageResults | `result_id` / `user_id` | UserIndex (`user_id`, `created_at`) | |
| Consultations | `consultation_id` | PatientIndex, StatusUrgencyIndex (`status`, `urgency_created`) | |
| Messages | `consultation_id` / `message_id` | IdempotencyIndex (`client_message_id`) | |
| Payments | `payment_id` | ConsultationIndex, PayerIndex | |
| Prescriptions, Referrals | `code` | – | |
| PushSubscriptions | `user_id` | – | one device per user (the last subscribe wins) |
| Sessions | `session_id` (`<phone>#sms\|ussd`) | – | TTL |
| CallbackRequests | `request_id` | UrgencyIndex (`status`, `created_at`) | |
| DispatchLogs | `log_id` | – | |
| Appointments, LabRequests, BloodRequests, Emergencies, HealthTips, DoctorPresence | see `extended_stack.py` | PatientIndex / StatusIndex / LocaleIndex | Emergencies have a 24 h TTL |
| AnonymousSessions | `session_token` | – | 7-day TTL |

---

## 5. Gaps, bugs and risks the frontend must know about

**Historical gap log:** several original 2026-10-22 items below were resolved by the backend rebuild and later frontend work. The current code and §6.1 take precedence; do not treat every older row as a still-open defect.

Ranked roughly by how much they affect the redesign. "FE" = fix in the frontend, "BE" = needs backend work.

| # | Issue | Where | Impact | Owner |
|---|---|---|---|---|
| 1 | **Resolved — push contract mismatch (original report).** The frontend reads `public_key` (backend sends `vapid_public_key`), posts `{ subscription: {...} }` (backend wants `{ endpoint, keys }` at the top level), and expects `{ ok }` (backend returns `{ subscribed }` / `{ unsubscribed }`). Against the real API, subscribing fails with `400`. The mock hides this. | `Frontend/src/api/endpoints.ts` `pushApi`, `src/lib/usePushSubscription.ts`, `src/api/mock.ts` | Push is broken against the real backend | FE |
| 2 | **No domain events are published.** Nothing calls EventBridge `put_events`, so `message.sent` and `payment.confirmed` never trigger a push, and `/sync` only returns `has_red_triage` without escalating any consultation. Keep polling as the primary update mechanism. | `consultation/post_message.py`, `payment/post_webhook.py`, `consultation/post_sync.py` | No push notifications; no RED escalation | BE |
| 3 | **VAPID keys are not configured.** The stack hard-codes `VAPID_PUBLIC_KEY="TO_BE_SET_POST_DEPLOY"` and an empty private key, so the public-key endpoint returns that placeholder string. | `push_stack.py` | Push unusable until set | BE |
| 4 | **Updated — demo payments require explicit Admin confirmation** (§3.5). The pay screen must handle "waiting for confirmation" well and time out gracefully; for demos, use `/admin/payments` → `POST /payments/{id}/simulate` when backend simulation is enabled. | `payment/post_initiate.py` | Demo flow stalls at payment | FE (UX) + docs |
| 5 | **Resolved — four API base URLs were missing** from the frontend config: extended, channel, anonymous, i18n. | `Frontend/src/config/env.ts`, `.env.example` | Tier 2 screens cannot reach the backend | FE |
| 6 | **Weak ownership checks.** `POST /consultations/{id}/messages` and `voice-note-upload-url` check only that the consultation exists, not that the caller owns it. `POST /consultations` trusts the `patient_id` and `urgency` from the body. Any doctor can read any case (audit S-04). | consultation handlers | Security | BE |
| 7 | **The client sets the payment amount** (`amount_xaf`, default 2000), and the webhook does not check it. | `payment/post_initiate.py` | Payment integrity | BE (FE: just don't send it) |
| 8 | **The voice-note presigned PUT signs `ContentLength=500KB`**, so S3 may reject uploads whose size differs. Test a real upload before you redesign the recorder. | `consultation/get_voice_note_upload_url.py` | Voice notes may fail | BE (verify) |
| 9 | **There is no way to list prescriptions or referrals for a consultation.** The patient only sees a code if the UI posts it into the chat, or keeps it locally. | doctor stack | The patient "My prescriptions" screen has no data source | BE (or FE workaround: doctor auto-posts the code as a message) |
| 10 | **Operators cannot list all lab requests.** `GET /lab-requests` returns only the caller's own. Operators can only open one by ID. | `extended/list_lab_requests.py` | Operator lab console has no list | BE |
| 11 | **Profile DOB and sex cannot be edited.** `PUT /profile` takes only `display_name` and `locale`. | `profile/put_profile.py` | Profile form must not offer them (or BE adds them) | BE/FE |
| 12 | **The doctor queue has no patient display info** (name, age, household member name). The UI has to show the complaint, urgency and age from the triage payload. | doctor handlers | Queue card design | FE |
| 13 | **The blood-bank lookup** finds only facilities whose *first* capability is `blood_bank` (the `primary_capability` GSI). | `extended/post_blood_request.py` | The suggestions list may be empty | BE |
| 14 | **The SMS/USSD facility search is a stub** that echoes the area name. Callback urgency is always AMBER. | `channel/session_engine.py` | Simulator demo only | BE |
| 15 | **Cognito callback URLs are localhost only.** | `auth_stack.py` | Any deployed frontend fails to log in | BE |
| 16 | **`Frontend/.env` is tracked in git.** It should hold placeholders only; real values belong in `.env.local`, which is gitignored by Vite convention. | repo root | Secret leak risk | Both |
| 17 | **Profile/household offline writes need a shared design.** The current outbox/sync supports triage, consultations and messages only; household creation accepts no idempotency key. The redesigned profile/member forms retain online-only writes with explicit connection status. Do not automatically retry non-idempotent member creation without a server/client deduplication contract. | `offline/db.ts`, `offline/outbox.ts`, `offline/sync.ts`, profile endpoints | Profile and household edits cannot yet be promised offline | FE + BE (idempotency) |
| 18 | **Extended request creation and anonymous consultation creation have no deduplication key.** Appointment, lab and blood requests and anonymous consultation creation accept no client idempotency key. The frontend retains local drafts and submits explicitly while connected; uncertain sends must be checked before retrying. Anonymous text messages do accept `client_message_id` and have a separate session-scoped outbox. | extended POST handlers, anonymous `post_consultation.py` / `post_message.py` | Fully queued patient request creation needs a backend deduplication contract | FE + BE |
| 19 | **Presence has no immediate Away operation.** PUT always refreshes `last_seen`; the list derives online presence from the last five minutes. The Away switch stops heartbeats and explains that expiry delay. | `put_doctor_presence.py`, `list_available_doctors.py` | Away is not an immediate server removal | BE / FE copy |
| 20 | **Admin cannot read inactive facilities or retrieve inactive tips.** Facility GET returns 404 when inactive; the public tip list only returns active items and no GET-by-ID exists. Preserve known IDs/content before deactivation; the tip editor can replace known content by ID. Do not invent an inactive-record list. | facility `get_facility.py`, extended tip handlers | Admin recovery/editing needs authenticated read endpoints | BE |

---

## 6. Mapping to the frontend: today and for the redesign

### 6.1 Current frontend coverage (2026-10-31)

The full audit of main commit `b27d6e7`, all 73 routes, fresh validation, and deployment limits is in [FRONTEND_BACKEND_COVERAGE.md](FRONTEND_BACKEND_COVERAGE.md).

| Backend area | Frontend correspondent | Status |
|---|---|---|
| Profile / household | `/app/profile`, `/app/profile/household` | Wired; online-write limits remain explicit |
| Facilities | `/app/facilities`, `/app/facilities/:id`, Admin editor | Wired, with live free street maps and offline overview; see [MAPS.md](MAPS.md) |
| Triage / sync | Wizard, result, history, outbox | Wired; client result IDs are sent through sync and reconciled with the server |
| Consultation / voice / payment | New, list, chat, payment, history / receipt | Wired; server amount and simulation status retained |
| Doctor queue / case / presence | `/doctor`, `/doctor/case/:id` | Wired |
| Rx / referral public lookup | `/rx/:code`, `/ref/:code` and entry pages | Wired |
| Push | Profile notification helper | Contract corrected; existing feature flag and deployment prerequisites still apply |
| Appointments / labs / blood / emergency | Patient services, RED share, operator views | Wired |
| Health tips / available doctors | Tips, Home, consultation availability | Wired |
| Operator console | Callbacks, dispatch, shared positions, blood, lab-by-ID | Wired |
| Admin console | Facilities, tips, visit confirmation | Wired |
| Anonymous session / consult / text / payment | `/ask`, `/ask/:id` | Wired; session-scoped text outbox |
| Verified doctor application / status | `/apply/doctor`, `/apply/status` | Added 2026-10-31 against §3.13, replacing the obsolete unrouted contract |
| Admin doctor review | `/admin/applications` | Added: all three checks, notes, duplicate references, decisions and resend invitation |
| Staff pool authentication | `/staff/sign-in` | Added separate authority/client; Cognito performs mandatory MFA |
| Payment simulation | `/admin/payments` | Added Admin-only demo tool; backend controls availability |
| Published translations | `/languages?locale=en\|fr\|pid` | Added a bilingual wording guide; full app translation remains incomplete |
| SMS / USSD and payment webhooks | Provider integrations; human callback / payment outcomes use existing screens | No public browser webhook forms; no simulator bypassing provider authentication |

### 6.2 Suggested information architecture for the redesign

Each row is a screen and the endpoints it needs. ★ = Tier 1 (must ship), ☆ = Tier 2.

**Public (no login)**
- ★ Landing / how it works / about
- ★ Facility directory + detail + call: `GET /facilities`, `GET /facilities/{id}` (offline seed fallback)
- ★ Quick triage (works signed out, offline): local engine; submit after sign-in
- ☆ Health tips feed: `GET /health-tips`
- ★ Rx / referral code lookup: `GET /prescriptions/{code}`, `GET /referrals/{code}`
- ☆ Ask anonymously: `/anonymous/*`
- ☆ SMS/USSD phone simulator: `POST /channels/sms`, `POST /channels/ussd`

**Patient app (`/app`)**
- ★ Home: next actions, active consultations, offline/sync state
- ★ Triage wizard → result (RED: "call / go now" first) → start consult
- ★ New consultation (for me / a household member): `POST /consultations`
- ★ Pay (me or someone else): `POST /payments/initiate`, poll `GET /payments/{id}`
- ★ Chat (text + voice): `GET /consultations/{id}`, `POST .../messages`, voice URLs
- ★ My consultations: `GET /consultations`
- ☆ History timeline: `GET /triage` + `GET /consultations` + `GET /payments`
- ☆ Receipts: `GET /payments`, `GET /payments/{id}`
- ★ Profile + household + language + notifications: `/profile*`, `/push/*`
- ☆ Available doctors: `GET /doctors/available`
- ☆ Appointments: `POST/GET/DELETE /appointments`
- ☆ Lab tests: `POST/GET /lab-requests`, `GET /lab-requests/{id}`
- ☆ Blood request: `POST /blood-requests`
- ☆ Emergency share-location button: `POST /emergency`

**Doctor console (`/doctor`)**
- ★ Queue (RED first, auto-refresh): `GET /doctor/queue`
- ★ Case (triage audit, thread, reply, voice, claim, close, prescribe, refer): `GET/PUT /doctor/queue/{id}[/claim]`, `POST /consultations/{id}/messages|prescription|referral`, `PUT .../close`
- ☆ Presence toggle / heartbeat: `PUT /doctor/presence` (extended API)

**Operator console (`/operator`)**: all ☆
- Nurse callbacks: `GET /operator/callbacks`, `PUT .../{id}/handle`
- Dispatch: facility search via `GET /facilities?capability=` + `POST /operator/dispatch-log`
- Emergencies (map/list): `GET /operator/emergencies`
- Blood requests: `GET /blood-requests`
- Lab status update: `PUT /lab-requests/{id}/status` (no list endpoint, §5 #10)

**Admin (`/admin`)**: all ☆
- Facilities CRUD: `POST/PUT /facilities`
- Health tips CRUD: `POST/PUT/DELETE /health-tips`
- Appointments to confirm: `GET /appointments?status=requested`, `PUT /appointments/{id}/confirm`

### 6.3 Design constraints the backend imposes

- **Offline first:** every write a patient makes must be queueable (outbox) and idempotent (`client_message_id`, client-generated `result_id`).
- **Urgency colours are semantic:** RED / AMBER / GREEN are clinical signals; keep them reserved and accessible (the current tokens are in `Frontend/src/index.css`).
- **Advisory wording:** triage is not clinically validated (audit C-01), so every result needs "advisory, not a diagnosis".
- **Low-end Android, slow networks:** small bundles, large tap targets, icon + text, voice notes as the low-literacy path.
- **No realtime:** design for polling plus "last updated" indicators.
- **Three locales:** EN / FR / Pidgin. Leave room for longer French strings.
