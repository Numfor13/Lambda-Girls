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
| **Doctor** | Manual (Cognito console/CLI) | Queue, claim, reply, prescribe, refer, close, presence heartbeat |
| **Operator** | Manual | Nurse callbacks, dispatch log, emergencies, blood requests, lab status |
| **Admin** | Manual | Facility CRUD, health tips CRUD, confirm appointments, lab status |
| **Anonymous** | No account: `X-Anonymous-Session` header | Consult and pay without identity (7-day session) |
| **Public** | No auth | Facilities, health tips, Rx/referral code lookup, VAPID key, i18n |
| **Feature phone** | SMS/USSD webhook | Menu: hospitals, first aid, symptom check, nurse callback |

---

## 2. Architecture at a glance

- **IaC:** AWS CDK (Python), entry `Backend/app.py`. 14 stacks named `HealthTrack-<Name>-<env>` (`env` = `dev` | `staging` | `prod`, from `-c env=`).
- **Compute:** Python 3.12 Lambdas, one per route. Shared layer at `Backend/lambda_layers/common/python/health_track_common/` (`response.ok/err`, `auth.require_group`, `anonymous`, `locale`, `fapshi`, `rules`).
- **Data:** DynamoDB tables named `HealthTrack-<Table>-<env>`. S3 for voice notes and i18n JSON.
- **Auth:** Cognito User Pool, Hosted UI (OAuth code flow + PKCE), email or phone sign-in. API Gateway uses a **Cognito User Pools authorizer**, so the frontend must send the **ID token** as `Authorization: Bearer <id_token>` (it already does: `Frontend/src/auth/session.ts`).
- **Dev conveniences:** in `dev`, sign-ups are auto-confirmed, Fapshi is **not called** (fake sandbox URL), and the webhook skips signature checks.

### ⚠️ There is no single API: there are 11 API Gateways

Every stack creates its **own** `RestApi`, so each service has its own base URL (CloudFormation output `HealthTrack-<X>ApiUrl-<env>`). The frontend's `src/config/env.ts` knows only 7 of them.

| Service key (frontend) | Stack | Base URL env var | In frontend env today? |
|---|---|---|---|
| `profile` | ProfileStack (`HealthTrackApi`) | `VITE_API_URL_PROFILE` | ✅ |
| `facility` | FacilityStack | `VITE_API_URL_FACILITY` | ✅ |
| `triage` | TriageStack | `VITE_API_URL_TRIAGE` | ✅ |
| `consultation` | ConsultationStack | `VITE_API_URL_CONSULTATION` | ✅ |
| `payment` | PaymentStack | `VITE_API_URL_PAYMENT` | ✅ |
| `doctor` | DoctorStack | `VITE_API_URL_DOCTOR` | ✅ |
| `push` | PushStack | `VITE_API_URL_PUSH` | ✅ |
| `extended` | ExtendedStack | *(add `VITE_API_URL_EXTENDED`)* | ❌ |
| `channel` | ChannelStack (SMS/USSD + operator) | *(add `VITE_API_URL_CHANNEL`)* | ❌ |
| `anonymous` | AnonymousStack | *(add `VITE_API_URL_ANONYMOUS`)* | ❌ |
| `i18n` | I18nStack | *(add `VITE_API_URL_I18N`)* | ❌ |

Note: `/doctor/presence` lives on the **extended** API, not the doctor API. `/operator/emergencies` is on **extended**, while `/operator/callbacks` is on **channel**.

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
- **Post confirmation:** creates the profile row and adds the user to the `Patient` group.
- **Hosted UI:** callback `http://localhost:5173/auth/callback`, logout `http://localhost:5173/sign-in`, scopes `openid email profile`. **Add the deployed frontend URL to `auth_stack.py` before you deploy the frontend anywhere.**

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

Ranked roughly by how much they affect the redesign. "FE" = fix in the frontend, "BE" = needs backend work.

| # | Issue | Where | Impact | Owner |
|---|---|---|---|---|
| 1 | **Push contract mismatch.** The frontend reads `public_key` (backend sends `vapid_public_key`), posts `{ subscription: {...} }` (backend wants `{ endpoint, keys }` at the top level), and expects `{ ok }` (backend returns `{ subscribed }` / `{ unsubscribed }`). Against the real API, subscribing fails with `400`. The mock hides this. | `Frontend/src/api/endpoints.ts` `pushApi`, `src/lib/usePushSubscription.ts`, `src/api/mock.ts` | Push is broken against the real backend | FE |
| 2 | **No domain events are published.** Nothing calls EventBridge `put_events`, so `message.sent` and `payment.confirmed` never trigger a push, and `/sync` only returns `has_red_triage` without escalating any consultation. Keep polling as the primary update mechanism. | `consultation/post_message.py`, `payment/post_webhook.py`, `consultation/post_sync.py` | No push notifications; no RED escalation | BE |
| 3 | **VAPID keys are not configured.** The stack hard-codes `VAPID_PUBLIC_KEY="TO_BE_SET_POST_DEPLOY"` and an empty private key, so the public-key endpoint returns that placeholder string. | `push_stack.py` | Push unusable until set | BE |
| 4 | **Dev payments never confirm** (§3.5). The pay screen must handle "waiting for confirmation" well and time out gracefully; for demos, use the webhook curl. | `payment/post_initiate.py` | Demo flow stalls at payment | FE (UX) + docs |
| 5 | **Four API base URLs are missing** from the frontend config: extended, channel, anonymous, i18n. | `Frontend/src/config/env.ts`, `.env.example` | Tier 2 screens cannot reach the backend | FE |
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

---

## 6. Mapping to the frontend: today and for the redesign

### 6.1 What the current frontend already covers

| Backend area | Current screens (`Frontend/src/features/...`) | Status |
|---|---|---|
| Profile and household | `profile/Profile.tsx`, `profile/Household.tsx` | ✅ wired |
| Facilities | `facilities/FacilityList.tsx`, `FacilityDetail.tsx` (+ offline seed cache) | ✅ wired (the map view is flagged off) |
| Triage | `triage/TriageWizard.tsx`, `TriageResult.tsx`, `BreathCounter.tsx` | ✅ wired (local engine plus server submit) |
| Consult and chat | `consult/ConsultNew.tsx`, `ConsultChat.tsx`, `ConsultList.tsx` | ✅ wired (text plus voice) |
| Payment | `payments/Payment.tsx` | ✅ wired (polls for confirmation) |
| Doctor | `doctor/DoctorQueue.tsx`, `DoctorCase.tsx` (claim, reply, prescribe, refer, close) | ✅ wired |
| Rx/referral lookup | `public/CodeLookup.tsx` (`/rx/:code`, `/ref/:code`) | ✅ wired |
| Push | `lib/usePushSubscription.ts` | ⚠️ contract mismatch (§5 #1) |
| Offline outbox and sync | `offline/*`, `app/SyncManager.tsx` | ✅ wired |
| Payments history / receipts | – | ❌ no screen (`flags.receipts` is off) |
| Triage history | – | ❌ no screen |
| Extended services (appointments, lab, blood, emergency, tips, available doctors, doctor presence) | – | ❌ no API client, no screens |
| Operator console (callbacks, dispatch, emergencies, blood, lab status) | – | ❌ none |
| Admin (facilities CRUD, tips CRUD, confirm appointments) | – | ❌ none |
| Anonymous mode | – | ❌ none |
| SMS/USSD simulator | – | ❌ none |
| i18n (FR / Pidgin) | – | ❌ (`<html lang>` is sent as `Accept-Language`; no string loading) |

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
