# Health Track — Backend Build Phases
> CDK stacks in Python · AWS Lambda, DynamoDB, S3, Cognito, API Gateway, SNS

---

## System Overview

**Health Track** is an offline-first health access platform for Buea and surrounding communities in Cameroon.

### User Roles

| Role | Description |
|---|---|
| **Patient** | Primary app user. Triages symptoms, requests consultations, pays, views history |
| **Phone Owner (On-Behalf)** | A proxy user who creates consultations for a household member or neighbour who has no phone |
| **Doctor** | Reviews the queue, replies to consultations, issues prescriptions and referrals |
| **Operator / Staff** | Staffs the nurse callback hotline, searches facilities by capability, logs dispatches |
| **Admin** (implied) | Manages facility data, curates health tips feed |

### Core Feature Groups

1. **Offline-first infrastructure** — PWA caching, offline write queue, sync-on-reconnect
2. **Facility directory** — 40 seeded Buea facilities, distance sorting, one-tap call
3. **Triage engine** — ~30 rules, 40 symptoms, age-banded thresholds, red/amber/green routing, auditable rule log
4. **Consultation & messaging** — async text chat, Opus voice notes, on-behalf support, idempotent messages
5. **Payment** — Fapshi pay-per-consultation, webhook, pay-for-someone-else, receipts
6. **Doctor queue** — red-first ordering, case view with triage audit, prescriptions, referrals
7. **Push notifications** — VAPID web push on doctor reply
8. **Multi-channel gateway** — shared session state machine for web, SMS, USSD; nurse callback queue; operator console
9. **Extended services** — appointments, lab tests, blood requests, emergency location share, health tips
10. **Localisation** — EN / FR / Pidgin string APIs; anonymous consultation mode

---

## Phase 0 — CDK Foundation & Shared Infrastructure

**Goal:** A deployable CDK app with environment config, shared constructs, and no business logic.

### Tasks

- [ ] Initialise CDK app: `cdk init app --language python`; set up `app.py` as the entry point
- [ ] Define environment configs (`dev`, `staging`, `prod`) in `cdk.json` and a `Config` dataclass
- [ ] Create `SharedStack`:
  - VPC (2 AZs, private + public subnets) — Lambdas run in private subnets
  - S3 bucket for Lambda deployment packages (versioned)
  - Shared Lambda layer (`aws_lambda.LayerVersion`) containing common utilities (response helpers, error classes, JWT decode util)
  - CloudWatch Log Groups with 30-day retention
- [ ] Create `SecretsStack`:
  - `aws_secretsmanager.Secret` for Fapshi API key + webhook signing secret
  - `aws_secretsmanager.Secret` for VAPID private key
  - `aws_secretsmanager.Secret` for telco SMS/USSD sandbox credentials
- [ ] IAM: define reusable managed policies (DynamoDB read, DynamoDB write, S3 read, S3 write)
- [ ] CDK bootstrap script and `Makefile` targets: `make deploy-dev`, `make diff`, `make destroy-dev`
- [ ] `pytest` project skeleton with `aws_cdk.assertions` for stack unit tests
- [ ] `.env.example` documenting every required environment variable

### Outputs
- Deployable empty CDK app
- Shared Layer ARN exported as a CloudFormation output
- Secrets ARNs exported

---

## Phase 1 — Identity & Auth

**Goal:** Cognito User Pool with role groups, JWT authorizer on API Gateway, patient profile CRUD.

### Tasks

- [ ] Create `AuthStack`:
  - `aws_cognito.UserPool` with email + phone sign-in, SRP auth flow
  - User Pool Groups: `Patient`, `Doctor`, `Operator`, `Admin`
  - App client (no client secret — SPA client); OAuth flows for hosted UI
  - Domain prefix for Cognito hosted UI
  - `aws_cognito.CfnUserPoolUICustomizationAttachment` placeholder for branding
- [ ] Lambda triggers on the User Pool:
  - **Pre-sign-up**: normalise phone number to E.164, block duplicate email
  - **Post-confirmation**: create a `Patient` record in DynamoDB and add user to `Patient` group by default
- [ ] Create `ProfileTable` (DynamoDB):
  - Partition key: `user_id` (Cognito `sub`)
  - Attributes: `display_name`, `phone`, `date_of_birth`, `sex`, `locale`, `on_behalf_profiles` (list)
  - TTL not set (permanent records)
- [ ] Create `ApiStack` base:
  - `aws_apigateway.RestApi` with CloudWatch access logging
  - `aws_apigateway.CognitoUserPoolsAuthorizer` (default authorizer for all protected routes)
  - `aws_apigateway.RequestValidator` enforcing body + params
  - CORS: allow specific origins (dev: `*`, prod: app domain)
- [ ] Lambda functions (Python 3.12, `aws_lambda.Function`):
  - `GET /profile` — return own profile
  - `PUT /profile` — update display name, locale
  - `POST /profile/household` — add an on-behalf profile entry
  - `DELETE /profile/household/{member_id}` — remove household member
- [ ] Unit tests for each Lambda handler (mock DynamoDB with `moto`)
- [ ] Integration test: sign up → post-confirmation → profile created

### Data Models

```
ProfileTable
  PK: user_id (String)
  display_name: String
  phone: String (E.164)
  date_of_birth: String (ISO-8601)
  sex: "male" | "female" | "other"
  locale: "en" | "fr" | "pid"
  on_behalf_profiles: List[{ member_id, name, dob, sex, relationship }]
  created_at: Number (epoch ms)
```

### Outputs
- Cognito User Pool ID + App Client ID exported
- API Gateway base URL exported

---

## Phase 2 — Facility Directory Service

**Goal:** Offline-capable facility API seeded with 40 Buea facilities; supports capability and location queries.

### Tasks

- [ ] Create `FacilityTable` (DynamoDB):
  - PK: `facility_id` (ULID)
  - GSI `RegionIndex`: PK `region`, SK `facility_id`
  - GSI `CapabilityIndex`: PK `primary_capability`, SK `facility_id`
  - Attributes: `name`, `region`, `quarter`, `address`, `phone`, `latitude`, `longitude`, `capabilities` (StringSet), `opening_hours`, `has_backup_power` (Bool), `accepts_csu_card` (Bool), `consultation_fee_xaf` (Number), `is_active` (Bool)
- [ ] Seed script `scripts/seed_facilities.py`:
  - CSV → DynamoDB batch-write of 40 facilities (Molyko through Buea Town)
  - Idempotent (`put_item` with condition `attribute_not_exists(facility_id)`)
  - Run via `cdk deploy` Custom Resource or standalone
- [ ] Lambda functions:
  - `GET /facilities` — list all active facilities (paginated, 50/page)
    - Query params: `capability`, `region`, `has_backup_power`, `accepts_csu_card`
  - `GET /facilities/{facility_id}` — full detail for one facility
  - `POST /facilities` (Admin-only) — create facility
  - `PUT /facilities/{facility_id}` (Admin-only) — update facility
- [ ] Distance sorting: return `latitude` + `longitude` to client; client computes Haversine distance — no server-side geo index needed
- [ ] API route authorisation: list + detail = no auth (public, offline-friendly); create + update = Admin group required
- [ ] Unit tests: list with filters, get by ID, seed idempotency

### Data Models

```
FacilityTable
  PK: facility_id (ULID, String)
  name: String
  region: String
  quarter: String
  address: String
  phone: String
  latitude: Number
  longitude: Number
  capabilities: SS  ["maternity","emergency","laboratory","pharmacy","blood_bank","x_ray"]
  opening_hours: Map { mon_fri, saturday, sunday, public_holiday }
  has_backup_power: Boolean
  accepts_csu_card: Boolean
  consultation_fee_xaf: Number
  is_active: Boolean
  created_at: Number
```

### Outputs
- Facility API routes mounted on the shared API
- Seed script documented in README

---

## Phase 3 — Triage Engine

**Goal:** Stateless triage Lambda that evaluates 40 symptoms against ~30 rules and returns an auditable red/amber/green result.

### Tasks

- [ ] Create `triage/rules/` directory inside the Lambda package (not in CDK, inside the function code):
  - `child_under_5.py` — danger signs with age-banded fast-breathing thresholds (≤2 months: ≥60 bpm, 2–12 months: ≥50 bpm, 1–5 years: ≥40 bpm)
  - `obstetric.py` — obstetric danger signs (haemorrhage, convulsion, prolonged labour, etc.)
  - `adult_red_flags.py` — adult general red flags
  - `rule_engine.py` — evaluates a symptom payload against all applicable rule files, returns `(urgency, rules_fired, recommendation, facility_type_needed)`
- [ ] Symptom payload schema (Zod-equivalent JSON Schema): `age_months`, `is_pregnant`, `symptoms: List[symptom_code]`, `vitals: { resp_rate, ... }`
- [ ] Urgency levels: `RED` (immediate emergency), `AMBER` (urgent, see doctor today), `GREEN` (non-urgent)
- [ ] Create `TriageResultTable` (DynamoDB):
  - PK: `result_id` (ULID)
  - SK: `user_id`
  - GSI `UserIndex`: PK `user_id`, SK `created_at`
  - Attributes: `urgency`, `recommendation`, `facility_type_needed`, `rules_fired` (List), `symptom_payload` (Map), `on_behalf_member_id` (nullable), `synced_from_offline` (Bool), `created_at`
- [ ] Lambda functions:
  - `POST /triage` — evaluate symptoms, store result, return result + rule audit
  - `GET /triage/{result_id}` — retrieve a past result with full rule audit
  - `GET /triage` — list own triage results (for consultation history)
- [ ] Offline-compatible: the `/triage` endpoint also accepts a `queued_at` field from the offline write queue; result stored with original timestamp
- [ ] Unit tests: one test per rule group, age-boundary tests for fast-breathing thresholds

### Data Models

```
TriageResultTable
  PK: result_id (ULID)
  SK: user_id
  urgency: "RED" | "AMBER" | "GREEN"
  recommendation: String
  facility_type_needed: String
  rules_fired: List[{ rule_id, rule_description, value_that_triggered }]
  symptom_payload: Map
  on_behalf_member_id: String | null
  synced_from_offline: Boolean
  created_at: Number
```

### Outputs
- `POST /triage` and `GET /triage` routes live
- Rule coverage documented (which rule IDs exist, what they check)

---

## Phase 4 — Consultation & Messaging Service

**Goal:** Async text chat, voice note upload/download, on-behalf support, idempotent messaging, offline sync endpoint.

### Tasks

- [ ] Create `ConsultationTable` (DynamoDB):
  - PK: `consultation_id` (ULID)
  - GSI `PatientIndex`: PK `patient_id`, SK `created_at`
  - GSI `StatusUrgencyIndex`: PK `status`, SK `urgency#created_at` (composite, for doctor queue ordering)
  - Attributes: `patient_id`, `phone_owner_id`, `on_behalf_member_id`, `triage_result_id`, `complaint`, `status` (`pending_payment` | `paid` | `open` | `closed`), `urgency`, `doctor_id`, `created_at`, `updated_at`
- [ ] Create `MessageTable` (DynamoDB):
  - PK: `consultation_id`
  - SK: `message_id` (ULID, sortable by time)
  - Attributes: `sender_id`, `sender_role` (`patient` | `doctor`), `content_type` (`text` | `voice_note`), `text_body`, `voice_note_key` (S3 key), `duration_seconds`, `client_message_id` (idempotency key), `created_at`
  - Condition on write: `attribute_not_exists(client_message_id)` enforced via GSI or conditional expression
- [ ] Create `VoiceNotesBucket` (S3):
  - Bucket policy: private; access only via presigned URL
  - Lifecycle rule: transition to S3-IA after 90 days
  - CORS for browser uploads
- [ ] Lambda functions:
  - `POST /consultations` — create consultation (status = `pending_payment`); links triage result if provided
  - `GET /consultations` — list own consultations (patient) or open queue (doctor)
  - `GET /consultations/{id}` — full consultation detail + messages
  - `POST /consultations/{id}/messages` — post text message (idempotent on `client_message_id`)
  - `POST /consultations/{id}/voice-note-upload-url` — generate S3 presigned PUT URL (max 500 KB, Opus)
  - `GET /consultations/{id}/voice-note/{message_id}` — generate S3 presigned GET URL
  - `POST /sync` — bulk offline write queue endpoint (processes multiple triage results + messages atomically; returns per-item success/failure)
- [ ] On-behalf: `patient_id` = household member's computed ID; `phone_owner_id` = Cognito sub of phone holder; each is stored separately so the member's record never mixes with the phone owner's history
- [ ] Priority escalation on reconnect: in `POST /sync`, if any triage result has `urgency = RED`, immediately update linked consultation's urgency in DynamoDB and publish an EventBridge event `triage.red.synced` (consumed in Phase 6 to re-sort doctor queue)
- [ ] Unit tests: idempotent message, on-behalf consultation creation, sync with RED escalation

### Data Models

```
ConsultationTable
  PK: consultation_id (ULID)
  patient_id: String
  phone_owner_id: String
  on_behalf_member_id: String | null
  triage_result_id: String | null
  complaint: String
  status: "pending_payment" | "paid" | "open" | "closed"
  urgency: "RED" | "AMBER" | "GREEN" | null
  doctor_id: String | null
  created_at: Number
  updated_at: Number

MessageTable
  PK: consultation_id
  SK: message_id (ULID)
  sender_id: String
  sender_role: "patient" | "doctor"
  content_type: "text" | "voice_note"
  text_body: String | null
  voice_note_key: String | null
  duration_seconds: Number | null
  client_message_id: String  (idempotency key)
  created_at: Number
```

### Outputs
- Consultation and message routes live
- Sync endpoint handles offline payloads
- Voice note bucket and presigned URL flow working

---

## Phase 5 — Payment Integration (Fapshi)

**Goal:** Pay-per-consultation gate, Fapshi webhook receiver, pay-for-someone-else, receipts.

### Tasks

- [ ] Create `PaymentTable` (DynamoDB):
  - PK: `payment_id` (ULID)
  - GSI `ConsultationIndex`: PK `consultation_id`
  - GSI `PayerIndex`: PK `payer_id`, SK `created_at`
  - Attributes: `consultation_id`, `payer_id`, `patient_id`, `amount_xaf`, `fapshi_ref`, `status` (`initiated` | `confirmed` | `failed`), `receipt_data` (Map), `created_at`, `confirmed_at`
- [ ] Lambda functions:
  - `POST /payments/initiate` — create Payment record (status = `initiated`), call Fapshi initiate API (via Secrets Manager key), return payment URL to client
  - `POST /payments/webhook` — **unauthenticated public endpoint**; verify Fapshi HMAC signature; on success: update Payment → `confirmed`, update Consultation → `paid`, publish EventBridge event `payment.confirmed`
  - `GET /payments` — list own payment history (payer)
  - `GET /payments/{payment_id}` — single payment receipt detail
- [ ] Pay-for-someone-else: `payer_id` ≠ `patient_id` — both stored on the Payment record; the consultation moves to `paid` regardless of who paid
- [ ] Webhook endpoint uses a dedicated API Gateway resource with NO Cognito authorizer; instead a Lambda function validates the Fapshi HMAC-SHA256 signature using the webhook secret from Secrets Manager
- [ ] Idempotent webhook: `condition_expression="attribute_not_exists(confirmed_at)"` prevents double-processing a replay
- [ ] Unit tests: initiation flow, webhook HMAC validation, double-delivery idempotency, pay-for-someone-else

### Data Models

```
PaymentTable
  PK: payment_id (ULID)
  consultation_id: String
  payer_id: String
  patient_id: String
  amount_xaf: Number
  fapshi_ref: String
  status: "initiated" | "confirmed" | "failed"
  receipt_data: Map { reference, amount, timestamp, payer_phone }
  created_at: Number
  confirmed_at: Number | null
```

### Outputs
- Payment initiation and webhook routes live
- Consultation transitions to `paid` automatically on webhook
- Payment history and receipts available

---

## Phase 6 — Doctor Queue & Case Management

**Goal:** Red-first ordered queue, case view with full triage audit, prescription and referral records, priority escalation.

### Tasks

- [ ] Lambda functions for doctors (require `Doctor` Cognito group in JWT claims):
  - `GET /doctor/queue` — list `paid` + `open` consultations ordered by urgency (`RED` first), then `created_at`; includes triage result summary and rules fired
  - `PUT /doctor/queue/{consultation_id}/claim` — set `doctor_id` = caller's sub, status → `open`
  - `GET /doctor/queue/{consultation_id}` — full case: complaint, triage result with all rules fired, full message thread
  - `POST /consultations/{id}/messages` — doctors use same message endpoint (role = `doctor`)
  - `PUT /consultations/{consultation_id}/close` — status → `closed`
- [ ] Prescription Lambda:
  - `POST /consultations/{id}/prescription` — create a Prescription record; generate a `prescription_code` (Base62 8-char); return code to doctor and store against consultation
  - `GET /prescriptions/{code}` — public lookup by code (for pharmacy presentation)
- [ ] Referral Lambda:
  - `POST /consultations/{id}/referral` — create a Referral record; target `facility_id`; generate `referral_code`
  - `GET /referrals/{code}` — public lookup
- [ ] Create `PrescriptionTable` and `ReferralTable` (DynamoDB):
  - PK: `code`; attributes: `consultation_id`, `doctor_id`, `patient_id`, `details`, `issued_at`, `status`
- [ ] Priority escalation: EventBridge rule subscribing to `triage.red.synced` → Lambda that calls `PUT /doctor/queue` sort key update (touches `urgency` field on Consultation to trigger re-query ordering)
- [ ] EventBridge rule for `payment.confirmed` (published in Phase 5) → Lambda that publishes Web Push notification to doctor(s) online (forward to Phase 7)
- [ ] Unit tests: queue ordering (RED before AMBER before GREEN), prescription code uniqueness, referral claim flow

### Data Models

```
PrescriptionTable
  PK: code (Base62 8-char)
  consultation_id: String
  doctor_id: String
  patient_id: String
  medication_details: String
  instructions: String
  issued_at: Number
  status: "active" | "dispensed"

ReferralTable
  PK: code (Base62 8-char)
  consultation_id: String
  doctor_id: String
  patient_id: String
  target_facility_id: String
  reason: String
  issued_at: Number
  status: "active" | "used"
```

### Outputs
- Doctor queue working with red-first ordering
- Prescriptions and referrals issuable and lookupable by code
- Priority escalation fires on reconnect sync

---

## Phase 7 — Web Push Notifications

**Goal:** VAPID-based web push so patients know when a doctor replied.

### Tasks

- [ ] Generate VAPID key pair; store private key in Secrets Manager; expose public key via `GET /push/vapid-public-key` (unauthenticated)
- [ ] Create `PushSubscriptionTable` (DynamoDB):
  - PK: `user_id`
  - Attributes: `subscription_json` (the browser PushSubscription object), `updated_at`
- [ ] Lambda functions:
  - `POST /push/subscribe` — upsert PushSubscription for authenticated user
  - `DELETE /push/subscribe` — remove subscription
  - `POST /push/send` (internal, not public) — takes `user_id` + `payload`; loads subscription from DynamoDB; sends via `pywebpush` library (bundled in Lambda layer)
- [ ] EventBridge rule: `message.sent` (published when doctor sends a message in Phase 4/6 Lambda) → trigger `push/send` Lambda for the consultation's `patient_id`
- [ ] EventBridge rule: `payment.confirmed` → push to patient confirming their consultation is in the queue
- [ ] Handle subscription expiry (410 Gone from push service → delete subscription record)
- [ ] Unit tests: subscribe/unsubscribe, push send invocation on message event

### Data Models

```
PushSubscriptionTable
  PK: user_id
  subscription_json: Map { endpoint, keys: { p256dh, auth } }
  updated_at: Number
```

### Outputs
- Push subscription API live
- Doctor reply triggers automatic push notification to patient

---

## Phase 8 — Multi-Channel Gateway (SMS / USSD)

**Goal:** Shared session state machine serving web, SMS, and USSD; nurse callback queue; operator console.

### Tasks

- [ ] Create `SessionTable` (DynamoDB):
  - PK: `session_id`
  - Attributes: `channel` (`web` | `sms` | `ussd`), `phone_number`, `state` (current step in flow), `context` (Map — accumulated answers), `triage_result_id`, `ttl` (epoch, 1 hour for USSD/SMS sessions)
- [ ] `session_engine.py` shared module (in Lambda layer):
  - State machine transitions for: triage flow, facility lookup, nurse callback
  - Input: `{ session_id, channel, message_body }` → Output: `{ response_text, next_state, is_final }`
- [ ] Create `SmsHandlerLambda`:
  - Webhook endpoint `POST /channels/sms` — receives inbound SMS from telco sandbox
  - Parses sender phone, message body
  - Creates or resumes Session from SessionTable
  - Runs session engine step
  - Returns response via telco sandbox API (outbound SMS)
  - Sandbox mode: log responses, no real telco call
- [ ] Create `UssdHandlerLambda`:
  - Webhook endpoint `POST /channels/ussd` — receives USSD session from gateway sandbox
  - Menu tree: 1. Nearest hospitals | 2. First-aid text | 3. Symptom check | 4. Nurse callback
  - Short numbered replies (works on any handset)
  - Sandbox mode: gateway simulator only
- [ ] Nurse callback queue:
  - `CallbackRequestTable` (DynamoDB): PK `request_id`, attributes: `phone`, `channel`, `triage_summary`, `urgency`, `status` (`pending` | `handled`), `created_at`
  - USSD option 4 or SMS keyword "CALLBACK" writes a record
  - Operator console reads this queue
- [ ] Operator console Lambda functions (require `Operator` Cognito group):
  - `GET /operator/callbacks` — list pending callback requests, urgency-sorted
  - `PUT /operator/callbacks/{id}/handle` — mark handled, log note
  - `GET /operator/facilities` — search facilities by `capability`, `quarter` (for phone dispatch)
  - `POST /operator/dispatch-log` — log a facility dispatch action
- [ ] Unit tests: state machine transitions, USSD menu parsing, nurse callback creation

### Data Models

```
SessionTable
  PK: session_id (phone_E164#channel or UUID for web)
  channel: "web" | "sms" | "ussd"
  phone_number: String
  state: String
  context: Map
  triage_result_id: String | null
  ttl: Number

CallbackRequestTable
  PK: request_id (ULID)
  phone: String
  channel: "sms" | "ussd"
  triage_summary: String
  urgency: "RED" | "AMBER" | "GREEN"
  status: "pending" | "handled"
  handler_note: String | null
  created_at: Number
```

### Outputs
- SMS and USSD webhook endpoints live (sandbox mode)
- Nurse callback queue populated from SMS/USSD
- Operator console with callback queue and facility dispatch

---

## Phase 9 — Extended Health Services

**Goal:** Appointments, lab tests, blood requests, emergency location share, health tips feed, available-doctors list.

### Tasks

- [ ] **Appointment booking**:
  - `AppointmentTable` (DynamoDB): `appointment_id`, `patient_id`, `facility_id`, `slot_date`, `slot_label` (morning/afternoon/evening), `status` (`requested` | `confirmed` | `cancelled`), `note`
  - Lambdas: `POST /appointments`, `GET /appointments`, `PUT /appointments/{id}/confirm` (Admin), `DELETE /appointments/{id}`
- [ ] **Lab test request**:
  - `LabRequestTable`: `request_id`, `patient_id`, `test_type`, `facility_id`, `collection_address`, `status` (`requested` | `sample_collected` | `results_ready` | `delivered`), `payment_id`, `result_summary`
  - Lambdas: `POST /lab-requests`, `GET /lab-requests`, `GET /lab-requests/{id}`, `PUT /lab-requests/{id}/status` (Admin/Operator)
- [ ] **Blood request**:
  - Reuse FacilityTable GSI: query `capabilities` contains `blood_bank`
  - `BloodRequestTable`: `request_id`, `requesting_facility_id`, `blood_type`, `units`, `urgency`, `status`
  - Lambda: `POST /blood-requests` → writes to operator console queue
  - `GET /blood-requests` (Operator only)
- [ ] **Emergency location share**:
  - Lambda: `POST /emergency` (authenticated) — writes `{ user_id, latitude, longitude, triage_result_id, timestamp }` to `EmergencyTable`; publishes SNS alert to Operator topic
  - `EmergencyTable`: PK `emergency_id`, TTL 24 hours
  - `GET /operator/emergencies` (Operator only)
- [ ] **Health tips feed**:
  - `HealthTipTable`: `tip_id`, `title`, `body`, `source_name`, `source_url`, `published_date`, `locale`, `tags`, `is_active`
  - Every record must have `source_name` and `published_date` (enforced at write time in Lambda)
  - Lambdas: `GET /health-tips` (public, paginated, filter by locale/tag), `POST /health-tips` (Admin), `PUT /health-tips/{id}`, `DELETE /health-tips/{id}`
- [ ] **Available doctors list**:
  - `DoctorPresenceTable`: PK `doctor_id`, attributes: `specialty`, `typical_response_minutes`, `is_online`, `last_seen`
  - Lambda: `PUT /doctor/presence` (Doctor only) — heartbeat endpoint, updates `last_seen`; `is_online` = `last_seen` within 5 minutes
  - Lambda: `GET /doctors/available` — lists doctors where `is_online = true`, sorted by `typical_response_minutes`
- [ ] Unit tests: appointment creation, blood request operator routing, emergency SNS publish

### Outputs
- Appointment, lab, blood, emergency, health tips, and doctor presence routes live

---

## Phase 10 — Localisation & Anonymous Mode

**Goal:** Serve locale strings (EN/FR/Pidgin), anonymous consultations, full i18n foundation.

### Tasks

- [ ] **Locale strings**:
  - Store JSON translation files in S3 under `i18n/{locale}.json` (`en`, `fr`, `pid`)
  - Lambda: `GET /i18n/{locale}` — streams file from S3; cache-control: 7 days
  - Seed script `scripts/seed_i18n.py` — uploads base translation files; triage and USSD strings populated first (highest priority per spec)
- [ ] **Anonymous consultation mode**:
  - Allow `POST /consultations` without a Cognito token by checking a request header `X-Anonymous-Session: <uuid>`
  - Anonymous sessions stored in `AnonymousSessionTable`: PK `session_token`, attributes: `created_at`, `ttl` (7 days)
  - Anonymous consultations stored with `patient_id = "anon#<session_token>"`; no name or phone on the record
  - Doctor sees complaint + triage result but no identifying info; can reply; patient reads via session token
  - Anonymous payment: Fapshi initiation uses anonymous session as payer reference
- [ ] **Locale preference on profile**: already in `ProfileTable` (Phase 1); ensure all Lambda responses include `Accept-Language` header passthrough
- [ ] **Audit and housekeeping**:
  - Enable DynamoDB Point-in-Time Recovery on all tables
  - Enable S3 versioning on VoiceNotesBucket
  - CloudWatch alarms: Lambda error rate > 1%, API 5xx > 0.5%, DynamoDB throttle > 0
  - X-Ray tracing enabled on all Lambdas
- [ ] Final CDK diff to confirm all stacks deploy cleanly to `staging`
- [ ] End-to-end smoke test script: register → triage → consult → pay (sandbox) → doctor reply → push notification received

### Data Models

```
AnonymousSessionTable
  PK: session_token (UUID)
  created_at: Number
  ttl: Number  (epoch, 7 days)
```

### Outputs
- i18n endpoint serving all three locales
- Anonymous consultation flow working end-to-end
- All tables PITR-enabled; alarms configured
- Staging environment fully deployed and smoke-tested

---

## Future Roadmap (Not in Build)

These phases map to the document's roadmap items and are tracked here for architectural awareness only.

| Feature | Phase |
|---|---|
| Community care booths (solar kiosk, tablet kiosk mode) | Phase 2 |
| Live telco shortcode + USSD service code | Phase 2 |
| Zero-rated data partnership | Phase 2 |
| Pidgin voice IVR menu | Phase 2 |
| Patient-held record (NFC / QR, offline-readable) | Phase 3 |
| Community health worker mode (CHT + DHIS2 integration) | Phase 3 |
| Facility feedback to district health office | Phase 3 |
| Health wallet on mobile money | Phase 3 |
| UHC enrolment assistance | Phase 3 |
| Ministry of Public Health content feed agreement | Phase 3 |
| Medication + antenatal reminders | Phase 3 |
| Medicine authenticity check (scratch code + SMS) | Phase 4 |
| Pharmacy stock visibility | Phase 4 |
| Home visit dispatch | Phase 4 |
| Transport partnerships (moto / ambulance) | Phase 4 |
| Voice note transcription (EN/FR; Pidgin noted as limitation) | Phase 4 |
| In-browser live voice/video consultation | Phase 4 |
| Offline map tiles (downloadable bundle) | Phase 4 |
| Clinical validation of triage rules (Univ. of Buea) | Phase 4 |

---

## Build Order Summary

| Phase | Depends On | Tier Impact |
|---|---|---|
| 0 — Foundation | — | Unblocks everything |
| 1 — Auth | 0 | Unblocks 2, 3, 4 |
| 2 — Facilities | 0, 1 | **Tier 1 complete** (directory, detail, call) |
| 3 — Triage | 1 | **Tier 1 complete** (triage + routing) |
| 4 — Consultation | 1, 3 | **Tier 1 complete** (chat, voice notes, sync) |
| 5 — Payment | 4 | **Tier 1 complete** (pay, webhook) |
| 6 — Doctor Queue | 4, 5 | **Tier 1 complete** (queue, reply) |
| 7 — Push | 4, 6 | Tier 2 |
| 8 — Multi-channel | 3, 4 | Tier 2 |
| 9 — Extended Services | 1, 2 | Tier 2 |
| 10 — i18n & Anon | all | Tier 2 |
