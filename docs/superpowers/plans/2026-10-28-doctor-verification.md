# Doctor Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Doctors apply without an account and upload ONMC, degree, ID and selfie evidence. Admins review against a checklist, and approval creates an MFA-mandatory staff account with 10-minute tokens and a 24-hour session.

**Architecture:** A new staff Cognito pool (Doctor/Operator/Admin) beside the patient pool, both accepted by the single API authorizer. A `DoctorApplications` table and a private KMS documents bucket in DataStack. Two router Lambdas in ApiStack: public `DoctorApplication` (drafts only) and `DoctorApplicationAdmin` (Cognito admin, reads documents). SES groundwork switches on only when `emailDomain` is configured.

**Tech Stack:** AWS CDK 2.273 (Python), Lambda Python 3.14 arm64, boto3, pytest + moto 5.

**Spec:** `docs/superpowers/specs/2026-10-28-doctor-verification-design.md`

## Global Constraints

- Run tests with `cd Backend && .venv/Scripts/python -m pytest tests/ -q`.
- Handlers follow the repo pattern: `handler(event, context)`, `ok`/`err` from `health_track_common.response`, try/except → `err(500, "Internal server error")`, `require_group(event, "Admin")` for admin routes.
- Doc types and limits: `onmc_certificate`, `onmc_card`, `medical_degree`, `identity_document` → PDF/JPEG/PNG; `selfie_with_ids` → JPEG/PNG only; max 10 MB (10 485 760 bytes); upload links expire in 900 s.
- ONMC number: upper-cased, `^[A-Z0-9]{1,8}/\d{4}$`, year 1950..current; the full number is the unique key.
- Staff client: access/ID token 10 min, refresh token 24 h, rotation on (grace 10 s), no `ALLOW_REFRESH_TOKEN_AUTH`. Staff pool MFA required, TOTP only, no self sign-up, temporary password valid 7 days.
- Lifecycle: `drafts/` expire after 1 day; objects tagged `state=rejected` expire after 90 days.
- No personal data in SNS reviewer alerts (application ID only).

## Review Focus

1. **The same application is submitted twice** (double tap, or a retry after a timeout). The second submit returns 409 and nothing is overwritten. Test: `test_submit_twice_conflicts`.
2. **A file's declared type doesn't match its bytes** (a PDF renamed `.jpg` as the selfie). Submit returns 400 naming the document. Test: `test_submit_rejects_wrong_magic_bytes`.
3. **Approve is retried after a partial failure** (the user already exists in Cognito). It succeeds and reuses the user. Test: `test_approve_is_retry_safe`.
4. **A second application for an ONMC number that is already approved.** It is flagged at submit, and approve returns 409. Test: `test_approve_refuses_onmc_already_approved`.
5. **A patient token or a Doctor token calls an admin route.** It gets 403. Test: `test_admin_routes_require_admin`.

---

### Task 1: Data layer and config

**Files:**
- Modify: `Backend/health_track/config.py`: add `sender_email`, `email_domain`, `reviewer_email`, `staff_login_url`, `staff_callback_urls`, `staff_logout_urls` (context keys `senderEmail`, `emailDomain`, `reviewerEmail`, `staffLoginUrl`, `staffCallbackUrls`, `staffLogoutUrls`; staff URLs default to the patient ones).
- Modify: `Backend/health_track/data_stack.py`: add the `DoctorApplications` table (GSIs `StatusIndex` (`status`, `submitted_at` N), `EmailIndex` (`email`), `OnmcIndex` (`onmc_number`)) and `self.doctor_documents_bucket` as in spec §6.2.
- Modify: `Backend/app.py` and `governance_stack.py`: add the table to `health_tables`; add the CloudTrail object-event prefix for the documents bucket.
- Test: `Backend/tests/test_infrastructure.py`.

**Steps:**
- [ ] Add a failing test, `test_doctor_documents_bucket_private_and_expiring`: KMS encryption, public access blocked, lifecycle rules for prefix `drafts/` (1 day) and tag `state=rejected` (90 days), CORS allows `POST`. Update the bucket count from 4 to 5.
- [ ] Implement, then run the infrastructure tests. Expected: all pass.
- [ ] Commit: `feat(backend): doctor applications table and documents bucket`.

### Task 2: Staff user pool

**Files:**
- Modify: `Backend/health_track/auth_stack.py`: add `self.staff_pool` and `self.staff_client` (spec §6.1). The patient pool keeps only the `Patient` group. Remove the pre-token trigger.
- Delete: `Backend/health_track/lambdas/auth/pre_token_generation.py` and its tests in `tests/test_auth_triggers.py`.
- Test: `tests/test_infrastructure.py::test_cognito_hardening` (rewrite) and `test_staff_pool_hardening`.

**Interfaces:** Produces `AuthStack.staff_pool: cognito.UserPool`; outputs `StaffUserPoolId`, `StaffAppClientId`, `StaffHostedUiDomain`, `StaffCognitoAuthority`.

**Steps:**
- [ ] Tests:
  - Patient pool: `MfaConfiguration == "OPTIONAL"` and no `PreTokenGeneration`.
  - Staff pool: `MfaConfiguration == "ON"`, `EnabledMfas == ["SOFTWARE_TOKEN_MFA"]`, `AdminCreateUserConfig.AllowAdminCreateUserOnly is True`, `TemporaryPasswordValidityDays == 7`.
  - Groups: `Doctor`/`Operator`/`Admin` exist on the staff pool only.
  - Staff client: `AccessTokenValidity == 10` and `IdTokenValidity == 10` (minutes), `RefreshTokenValidity == 1440` (minutes), `RefreshTokenRotation.Feature == "ENABLED"`, and `"ALLOW_REFRESH_TOKEN_AUTH"` not in `ExplicitAuthFlows`.
- [ ] Implement with `refresh_token_rotation_grace_period=Duration.seconds(10)`, `user_invitation` (the template includes `{username}`, `{####}` and `staff_login_url`), and `UserPoolEmail.with_ses` only when `email_domain` is set.
- [ ] Run the tests. Expected: pass. Commit: `feat(backend): staff user pool with mandatory TOTP and short sessions`.

### Task 3: Public application handlers

**Files:**
- Create: `Backend/health_track/lambdas/doctor_application/app_util.py`: `DOC_TYPES: dict[str, set[str]]`, `MAX_BYTES`, `validate_application(body) -> tuple[dict | None, str | None]`, `matches_magic(content_type: str, head: bytes) -> bool`, `send_email(to: str, subject: str, text: str) -> None` (no-op that logs `email_skipped` when `SENDER_EMAIL` is unset), and `parse_body`/`path_param`/`query_param` (same contract as `extended_util`).
- Create: `post_uploads.py`, `post_application.py`, `get_application_status.py` in the same folder.
- Test: `Backend/tests/test_doctor_application_handlers.py`.

**Interfaces:** Env `APPLICATION_TABLE`, `DOCUMENTS_BUCKET`, `REVIEWER_TOPIC_ARN`, `SENDER_EMAIL` (optional), `STAFF_USER_POOL_ID`. Item shape as in spec §6.2. Frozen key: `doctor-applications/{id}/{doc_type}`. Draft key: `drafts/{id}/{doc_type}`.

**Steps:**
- [ ] Failing tests:
  - `test_uploads_returns_presigned_post_for_all_five`
  - `test_uploads_rejects_pdf_selfie`
  - `test_uploads_rejects_missing_doc_type`
  - `test_submit_happy_path`: 201, item `pending`, frozen copies exist, all `checks` false, SNS published.
  - `test_submit_rejects_bad_onmc_number`
  - `test_submit_rejects_missing_document`
  - `test_submit_rejects_wrong_magic_bytes`
  - `test_submit_twice_conflicts`
  - `test_submit_conflicts_on_active_email`
  - `test_submit_flags_duplicate_onmc`: `duplicate_onmc` is true on the new item.
  - `test_status_returns_only_public_fields`
  - `test_status_unknown_id_404`
- [ ] Implement:
  - Submit uses `put_item` with `ConditionExpression="attribute_not_exists(application_id)"`.
  - Read the first 8 bytes of each draft with `Range`, then `copy_object(..., CopySourceIfMatch=etag)`.
  - The email-conflict check queries `EmailIndex`, then calls `admin_get_user` on the staff pool.
- [ ] Run the tests. Expected: pass. Commit: `feat(backend): public doctor application endpoints`.

### Task 4: Admin review handlers

**Files:**
- Create: `list_applications.py`, `get_application.py`, `put_application.py`, `approve_application.py`, `reject_application.py` and `resend_invite.py` in `lambdas/doctor_application/`.
- Test: the same test file.

**Interfaces:** Env adds `PROFILE_TABLE`. Approval writes `Profiles` `{user_id, email, display_name, role: "doctor", specialty, onmc_number, locale: "en", created_at}`.

**Steps:**
- [ ] Failing tests:
  - `test_admin_routes_require_admin`: Patient and Doctor callers get 403.
  - `test_list_by_status`
  - `test_get_includes_document_urls_and_duplicates`
  - `test_put_moves_to_under_review_and_sets_checks`
  - `test_put_refused_after_decision`
  - `test_approve_requires_all_checks`
  - `test_approve_creates_doctor`: the user is in group `Doctor`, the profile is written, and the status is `approved`.
  - `test_approve_is_retry_safe`
  - `test_approve_refuses_onmc_already_approved`
  - `test_reject_requires_reason_and_tags_documents`
  - `test_resend_invite_only_for_unconfirmed`
- [ ] Implement:
  - Approve: `admin_create_user` (catch `UsernameExistsException`), `admin_add_user_to_group`, put the profile, then a conditional update (`status IN (pending, under_review)`).
  - Resend: `admin_create_user(MessageAction="RESEND")` when `UserStatus == "FORCE_CHANGE_PASSWORD"`, else 409.
- [ ] Run the tests. Expected: pass. Commit: `feat(backend): admin review of doctor applications`.

### Task 5: API wiring

**Files:**
- Modify: `Backend/health_track/api_stack.py`:
  - Two functions with routes from spec §6.4. The public role gets `drafts/*` read/write/put-tagging and `doctor-applications/*` put. The admin role gets read, put-tagging and Cognito admin actions on the staff pool.
  - Throttles: `/doctor-applications/uploads/POST` (1, 2), `/doctor-applications/POST` (1, 2), `/doctor-applications/{application_id}/GET` (2, 5).
  - An authorizer over `[user_pool, staff_pool]`.
  - A reviewer SNS topic subscribed to `reviewer_email or alert_email`.
  - When `email_domain` is set: a `ses.EmailIdentity`, plus `ses:SendEmail` for both functions.
- Modify: `Backend/app.py` to pass `staff_pool`.
- Test: `test_infrastructure.py`: public routes (add the 3), function count, authorizer `ProviderARNs` length 2, and the public role cannot `cognito-idp:*` or read `doctor-applications/*`.

**Steps:**
- [ ] Update the failing infrastructure tests, implement, then run the full suite. Expected: all pass. Run `cdk synth` (via `app.py`) once.
- [ ] Commit: `feat(backend): wire doctor verification API and staff authorizer`.

### Task 6: Handover docs

**Files:**
- Create: `Backend/PENDING_BEFORE_DEPLOY.md` (spec §9 items, with exact commands).
- Modify: `docs/BACKEND_FEATURE_MAP.md` (new endpoints, upload sequence, staff sign-in, env values) and `Backend/RUNBOOK.md` (create the first Admin; reset an authenticator).

**Steps:**
- [ ] Write the docs. Commit: `docs: doctor verification handover and pending deploy checklist`.
