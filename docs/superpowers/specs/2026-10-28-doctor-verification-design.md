# Doctor verification and staff sign-in: design

| | |
|---|---|
| **Date** | 2026-10-28 |
| **Scope** | Backend only (`Backend/`). Frontend screens and API integration are built by someone else from §8. |
| **Fixes** | Audit `audit/02-solution-assessment.md` §4.1 "No doctor supply model" and §6.6 "a doctor onboarding and verification process". |

## 1. Why

Today a doctor account can be created only by an engineer with the AWS CLI. There is no licence check, so anyone handed the `Doctor` group can answer patients. CareBridge needs a self-service way for doctors to apply and a review step that proves:

1. the person holds a valid right to practise in Cameroon (ONMC inscription), and
2. the person applying **is** that doctor, not someone using a real doctor's stolen or bought documents.

## 2. Goals, non-goals, anti-goals

**Goals**
- A doctor applies **without an account**, from a "Sign up as a doctor" entry point, and uploads the required documents.
- An admin reviews the application against a fixed checklist and approves or rejects it.
- Approval creates the doctor's account; Cognito emails a temporary password and a login link.
- First login forces: new password → authenticator-app (TOTP) setup by QR code → code → dashboard. MFA is mandatory for doctors.
- Doctor sessions: access/ID tokens last **10 minutes**, renewed silently with a **rotating** refresh token; the session ends **24 hours after login**, after which email + password + TOTP code are required again.
- Email groundwork is in place for when a domain exists; nothing breaks without it.

**Non-goals**
- Automated document checks (OCR, face matching with Rekognition, ONMC register API). Review is human. Possible later.
- Video/biometric liveness (Rekognition Face Liveness). The "liveness" check is the selfie holding both cards, judged by the admin.
- Frontend screens.
- Lost-authenticator self-service. An admin resets it from the console/CLI (in the pending file).

**Anti-goals** (would be a failure even if it "works")
- An unreviewed or patient account gaining the `Doctor` group by any path.
- Identity documents readable by anyone except Admins, or kept forever when they aren't needed.
- Patients getting the 10-minute / 24-hour session rules (they need long offline sessions).
- Public upload endpoints that let anyone store arbitrary files in our bucket at will.

## 3. Decisions taken with the owner

- **Waspito-style separate doctor path** (owner, 2026-10-28). Doctors don't become patients first. No account exists until approval.
- **Flow and session rules in §2 Goals** are the owner's, verbatim.
- **Separate staff user pool** for `Doctor`, `Operator`, `Admin` with MFA required (owner accepted). Token lifetime and MFA are per pool/app client in Cognito, not per group, so this is the only way to give doctors 10-min/24-h/mandatory-MFA without imposing it on patients.
- **No domain yet** (owner). Build the email groundwork, keep it switched off, and list what's left in `Backend/PENDING_BEFORE_DEPLOY.md`.
- **ONMC number is permanent** (owner, 2026-10-28): in `NNNNN/YYYY` the year is the year of first inscription and never changes, even when the card is renewed. The full number is the unique key for duplicate checks.
- **Required documents** (owner): ONMC inscription certificate, ONMC professional ID card (with registration number, e.g. `XXXXX/2026`), medical degree, CNI or passport, and a selfie holding the CNI/passport and the ONMC card next to the face.

## 4. Builder's calls (made by Claude; owner may override)

- **Application fields:** `full_name`, `email`, `phone`, `specialty` (the existing 21-value list), `onmc_number`, `medical_school`, `graduation_year`, `identity_document_type` (`cni` | `passport`), `identity_document_number`. The old form's recommendation letter, hospitals worked, recommending hospital, and the "graduated ≥ 7 years ago / ≥ 3 years experience" rules are **dropped**: the ONMC inscription is the legal proof of the right to practise, and those rules would exclude newly registered doctors.
- **Application number = status-lookup key.** Without email, an applicant checks status with the application ID they get at submission (a UUID, unguessable).
- **Admin checklist gates approval.** Three booleans must all be true before approve succeeds: `onmc_register_verified`, `documents_consistent`, `selfie_matches`. This makes the review process explicit and auditable.
- **One account per ONMC number.** Approve is refused if another application with the same ONMC number is already approved. Duplicates are *flagged* (not blocked) at submission, so a fraudster can't lock the real doctor out by applying first.
- **Approved doctors are doctor-only** (no `Patient` group), as with Waspito's separate apps.
- **Document retention:** unsubmitted uploads deleted after 1 day; a rejected application's documents deleted 90 days after rejection; an approved doctor's documents kept (licence evidence).
- **New-application alert** goes to an SNS email topic subscribed to `reviewerEmail` (falls back to `alertEmail`). The message carries only the application ID and a count, no personal data.
- **Existing patient pool loses staff groups and the pre-token trigger.** Its workaround (hide staff groups without TOTP) is no longer needed once staff live in a pool where MFA is required.

## 5. Constraints

- Follow the rebuilt backend's conventions: one `ApiStack` REST API, one Lambda per domain behind `health_track_common.router`, per-route throttles for public routes, KMS health-data key, `ok`/`err` responses, moto-based tests, infrastructure assertions in `tests/test_infrastructure.py`.
- Region us-east-1; budget ~$3/month. Nothing here adds fixed monthly cost except what's already in the account (one more table and bucket are pay-per-use).
- Cognito facts verified against AWS docs on 2026-10-28:
  - Access/ID token validity per app client, minimum 5 minutes; refresh token 60 min – 10 years.
  - With refresh-token rotation, each new refresh token is valid only for the **remaining** time of the original, so the 24 h counts from login. Rotation requires the app client to **not** allow `REFRESH_TOKEN_AUTH`; refresh goes through `GetTokensFromRefreshToken` or the OAuth token endpoint (which `oidc-client-ts` uses).
  - With MFA set to required, Cognito's sign-in drives `NEW_PASSWORD_REQUIRED` then `MFA_SETUP` (TOTP QR) for an admin-created user.

## 6. Design

### 6.1 Identity (AuthStack)

**Patient pool (existing)** — unchanged except: only the `Patient` group; pre-token-generation trigger and its Lambda removed.

**Staff pool (new)** `health-track-staff-<env>`
- Self sign-up **off**; users exist only via admin creation (approval, or CLI for Operators/Admins).
- Sign-in by email; MFA **required**, TOTP only; same password policy (min 12); account recovery by email.
- Temporary password valid 7 days. Invitation email template: greeting, temporary password, username (email), and the staff login URL (`staffLoginUrl` from config).
- Groups: `Doctor`, `Operator`, `Admin`.
- Email sender: Cognito default until `senderEmail` is configured, then SES (§6.6).
- App client `health-track-staff-<env>`: authorization-code + SRP, scopes `openid email profile`, access/ID 10 min, refresh 24 h, refresh-token rotation enabled (grace 10 s), `ALLOW_REFRESH_TOKEN_AUTH` not allowed. Callback/logout URLs from `staffCallbackUrls` / `staffLogoutUrls` (default to the patient ones).
- Hosted UI domain prefix `health-track-staff-<env>`.
- Outputs: `StaffUserPoolId`, `StaffAppClientId`, `StaffHostedUiDomain`, `StaffCognitoAuthority`.

**API authorizer** accepts tokens from **both** pools. Handlers are unchanged: they read `sub` and `cognito:groups`. Since the patient pool has no staff groups, no patient token can carry `Doctor`/`Operator`/`Admin`.

### 6.2 Data (DataStack)

**Table `DoctorApplications`** — PK `application_id`; GSIs `StatusIndex` (`status`, `submitted_at` N), `EmailIndex` (`email`), `OnmcIndex` (`onmc_number`). Added to the governance health-table list.

Item:
```
application_id, status, submitted_at, updated_at,
full_name, email (lower-cased), phone, specialty, onmc_number (upper-cased),
medical_school, graduation_year, identity_document_type, identity_document_number,
documents: {doc_type: s3_key},
checks: {onmc_register_verified, documents_consistent, selfie_matches} (all false at submit),
admin_notes, reviewer_id, reviewed_at, rejection_reason, doctor_user_id (on approval)
```
Status: `pending` → `under_review` (first admin edit) → `approving` → `approved`, or → `rejected`. Reject is allowed from `pending` or `under_review`. Approve claims `approving` **before** creating the account, so a concurrent or later reject can never leave a live Doctor account on a rejected application. A failed approve is finished by approving again. (Added after final review.) A rejected applicant may apply again (new application).

**Bucket `DoctorDocumentsBucket`** — KMS (health-data key), block public access, SSL only, access logs, not versioned, CORS `POST` from allowed origins.

- Uploads land in `drafts/<application_id>/<doc_type>`; everything under `drafts/` expires after 1 day.
- At submit each draft is copied to a **frozen** key `doctor-applications/<application_id>/<doc_type>`. Presigned POSTs can only write under `drafts/`, so an applicant cannot overwrite a document after it was checked.
- Objects tagged `state=rejected` expire 90 days after they were submitted, because S3 counts from object creation; untagged (submitted/approved) never expire.

**Record retention (builder's call):** application items are kept, including rejected ones, because the duplicate flags need them to catch a re-application after a fraud rejection. Whether to strip personal fields from old rejected records goes to the data-protection review in the pending file.

### 6.3 Documents

| `doc_type` | Allowed types | Max |
|---|---|---|
| `onmc_certificate` | PDF, JPEG, PNG | 5 MB |
| `onmc_card` | PDF, JPEG, PNG | 5 MB |
| `medical_degree` | PDF, JPEG, PNG | 5 MB |
| `identity_document` | PDF, JPEG, PNG | 5 MB |
| `selfie_with_ids` | JPEG, PNG only (a photo, never a PDF) | 5 MB |

**Abuse limits (added after final review):** at most 200 applications may be awaiting review (`pending` + `under_review`). Beyond that, uploads and submissions return 503. This bounds permanent storage to about 5 GB.

Uploads use **presigned POST** (not PUT) so S3 itself enforces the exact key, `Content-Type` and `content-length-range`. At submit the backend reads the first bytes of every draft and checks they match the declared type (`%PDF`, JPEG `FF D8 FF`, PNG `89 50 4E 47`), then copies it to the frozen key with `CopySourceIfMatch` set to the ETag it checked, so the copy is exactly the bytes that passed.

### 6.4 API

All under the single REST API. Public routes get per-route throttles.

**Public (no auth)**

| Route | Purpose |
|---|---|
| `POST /doctor-applications/uploads` | Body `{documents: {doc_type: content_type}}` with all five types → `201 {application_id, expires_in: 900, uploads: {doc_type: {url, fields}}}`. Reserves an ID; nothing stored in DynamoDB yet. |
| `POST /doctor-applications` | Body: `application_id` from the step above + the fields in §4 → `201 {application_id, status: "pending"}`. Validates fields, verifies documents, refuses (409) if the email already has a `pending`/`under_review`/`approved` application or a staff account, refuses (409) if this `application_id` was already submitted, flags duplicate ONMC numbers, emails "received" (if email is configured), alerts reviewers. |
| `GET /doctor-applications/{application_id}` | `{application_id, status, submitted_at, reviewed_at, rejection_reason}` only. |

**Admin (staff pool, `Admin` group)**

| Route | Purpose |
|---|---|
| `GET /admin/doctor-applications?status=` | List by status (default `pending`), newest first. |
| `GET /admin/doctor-applications/{id}` | Full item + `document_urls` (presigned GET, 5 min) + `duplicates: {onmc_number: [{application_id, status}], email: [...]}`. |
| `PUT /admin/doctor-applications/{id}` | `{admin_notes?, checks?: {...}}`; moves `pending` → `under_review`, records reviewer. Not allowed once approved/rejected. |
| `POST /admin/doctor-applications/{id}/approve` | Requires all three checks true and no other approved application with the same ONMC number. Creates the staff user (email verified, `name`, `phone_number`), adds `Doctor`, writes a `Profiles` item for the doctor (`display_name`, `role: doctor`, `specialty`, `onmc_number`), sets `approved`, tags documents `approved`. Retry-safe: an existing user is reused. Returns `{approved, email}`. |
| `POST /admin/doctor-applications/{id}/reject` | `{reason}` required → `rejected`, tags documents `rejected`, emails the reason (if configured). |
| `POST /admin/doctor-applications/{id}/resend-invite` | Only for `approved` applications whose user has not completed first login (`FORCE_CHANGE_PASSWORD`): re-sends the invitation with a fresh temporary password. Covers expired passwords and invites lost in spam. |

New domain Lambda `DoctorApplication` (public routes) and `DoctorApplicationAdmin` (admin routes), split so the public function's role cannot create Cognito users or read submitted documents: it may read and write only `drafts/*` and write (copy into) `doctor-applications/*`.

### 6.5 Validation

- `email`: basic shape, lower-cased; `phone`: E.164 (`+` and 8–15 digits); `specialty`: one of the 21 values; `onmc_number`: `^[A-Z0-9]{1,8}/\d{4}$` after upper-casing, year ≤ current year; `graduation_year`: 1950..current year; `identity_document_type`: `cni` | `passport`; text fields non-empty, trimmed, length-capped.
- Reject reason: non-empty, ≤ 500 chars.

### 6.6 Email groundwork

Config keys (all empty until the domain exists): `senderEmail`, `emailDomain`, `reviewerEmail`, `staffLoginUrl`.

- When `emailDomain` is set: CDK creates an SES domain identity (Easy DKIM), the staff pool sends via SES from `senderEmail`, and the application Lambdas get `ses:SendEmail` and `SENDER_EMAIL`.
- When empty: applicant emails are skipped and logged (`email_skipped`); Cognito's default sender still delivers the approval invitation (limit ~50/day, fine at this scale).
- Applicant emails: "application received" (with application ID and status-page hint) and "application rejected" (with reason). Plain text, no documents.

### 6.7 Observability

`events.record()` business events: `doctor_application.submitted`, `.approved`, `.rejected`. Both new functions on the dashboard error/duration widgets via the existing loop.

## 7. Testing

- Handler tests with moto (S3, DynamoDB, Cognito, SNS): happy path end to end; each validation failure; missing/wrong-type document; duplicate email; duplicate ONMC flag and approve refusal; approve without checks; approve retry; reject; admin routes refuse non-Admin; status route leaks nothing else.
- Infrastructure tests: staff pool MFA `ON`, TOTP only, no self sign-up; staff client token validity 10 min / 24 h, rotation enabled, no `ALLOW_REFRESH_TOKEN_AUTH`; patient pool has only `Patient` and no pre-token trigger; authorizer lists two pools; new public routes are exactly the three above; documents bucket encrypted, private, lifecycle by tag; updated resource counts.

## 8. Handover to the frontend developer

Update `docs/BACKEND_FEATURE_MAP.md` with the endpoints in §6.4, the upload sequence (reserve → POST each file with the returned `fields` → submit), the status page, and the staff sign-in: staff screens use the **staff** authority/client ID (new `VITE_COGNITO_STAFF_*` values), patients keep the current ones.

## 9. Pending before deployment

Tracked in `Backend/PENDING_BEFORE_DEPLOY.md` (created with this work): domain + SES identity + DKIM DNS + SES production access; `staffLoginUrl` and staff callback URLs; first Admin in the staff pool (CLI); re-create any staff accounts that lived in the patient pool; `reviewerEmail`; the "usually within 24 hours" review promise; data-protection review for storing national ID images (Cameroon 2024 law, data in us-east-1); first deploy check that the rotation setting applied; lost-authenticator reset procedure.
