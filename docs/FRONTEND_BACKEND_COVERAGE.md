# Backend to frontend coverage — 2026-10-31

Audited all **73 HTTP route declarations** in `Backend/health_track/api_stack.py` on main commit `b27d6e7` (including the doctor-verification merge). Main was fast-forwarded into `feat/frontend-redesign`. Frontend implementation commit: `a9cf07f`. This is a source-code coverage audit; existing screens were checked for routes and API calls, while the new workflows below received fresh functional and responsive QA.

## Added in this pass

| Feature | Page | Behavior |
|---|---|---|
| Verified doctor application | `/apply/doctor` | Validated professional and identity fields; five required documents; 5 MB limit, photo-only selfie; reserve → multipart S3 POST per document → submit. Retains the reservation for retries and checks status after an uncertain submission. Entries/files stay in page memory, with leave protection. |
| Applicant outcome | `/apply/status?ref=<UUID>` | Public status only, polling while pending/reviewing/creating an account, rejection reason, ID/link copying and staff sign-in. No personal or document fields are expected from the public API. |
| Admin credential review | `/admin/applications` | Server-side status filter, URL selection/search, private documents, duplicate ONMC/email references, saved notes and three verification checks, approve, reject with reason, retry interrupted approval, resend invitation. Terminal applications are read-only. |
| Staff authentication | `/staff/sign-in` | Separate Cognito authority/client and role handling; uses the existing callback path. Cognito handles password change and authenticator setup/code. Patient-pool claims cannot grant staff roles in the UI. |
| Admin demo payment confirmation | `/admin/payments` | ID-based simulation with confirmation and backend result handling. Backend remains authoritative: unavailable unless simulation is enabled without live Fapshi credentials. No fabricated Admin payment list or access to private payer records. |
| Published language wording | `/languages?locale=en\|fr\|pid` | Loads `GET /i18n/{locale}`, pairs English and selected-language symptom terms, searches either language. Footer language links open this guide. Other screens remain English; this does not claim a fully translated app. |

All use the existing Fraunces/Inter, cream/mint/green tokens, AppPage/Panel, Field, Button, feedback and staff-shell patterns. The patient tab bar is unchanged. Existing application code using hospital recommendations, a single PUT upload and `/applications` was replaced because it did not match the implemented backend.

The registered-patient payment screen now retains the server amount and `simulated` response. A demo payment exposes its payment ID and says that an Admin must confirm it. The registered mock no longer auto-confirms a payment during a GET; the Admin tool drives that transition.

## Free maps

The owner also requested free map APIs. Shared map surfaces now use OpenStreetMap immediately, prefer free Google Maps Embed for a single location when a restricted key is configured, and use Google Maps URLs for directions. The coordinate-only view remains as an offline/error fallback. See [MAPS.md](MAPS.md) for coverage, privacy, provider requirements and configuration.

## Configuration and deployment

Keep `VITE_API_BASE_URL` pointed at the unified API; `VITE_API_URL_DOCTOR_APPLICATION` and `VITE_API_URL_I18N` are optional overrides.

Staff configuration from `HealthTrack-Auth-<env>` outputs:

- `VITE_COGNITO_STAFF_AUTHORITY` ← `StaffCognitoAuthority`
- `VITE_COGNITO_STAFF_CLIENT_ID` ← `StaffAppClientId`
- `VITE_COGNITO_STAFF_DOMAIN` ← `StaffHostedUiDomain`
- `VITE_COGNITO_STAFF_REDIRECT_URI` ← the registered callback (defaults to the current origin + `/auth/callback`)

Place real configuration in gitignored `.env.local`. Examples and mock mode contain placeholders. Follow `Backend/PENDING_BEFORE_DEPLOY.md` for the first staff Admin, callback/domain/SES configuration and deployment prerequisites.

## Validation and limits

- Fresh browser flows in local mock mode: empty details focus/inline errors, missing documents, all five file selections, leave/cancel protection, submit, public pending/approved status, Admin notes/checks save, approval gating and terminal read-only review. Fake document bytes are never uploaded in mock mode.
- Patient demo checkout → visible payment ID → Admin confirmation succeeds. The server simulation result for a progressed consultation is handled separately.
- French wording loads; bilingual search filters terms. All guide languages use the same published backend fixtures in mock mode.
- Five responsive sizes: 375×812, 1280×620, 1536×730, 1440×900, 1920×960. Queue, review, application form, status, staff sign-in, language guide and Admin payment tool have one h1 and no horizontal page overflow. New form controls are labeled. Screenshots saved outside the repo under `C:/Users/Bryan/.codex/visualizations/2026/10/31/carebridge-feature-coverage/`.
- Browser QA used the available in-app Chromium browser. Separate installed-Chrome verification was not performed.
- Live Cognito/MFA, S3 upload/download, invitation email, live payment credentials and deployed endpoint permissions were not exercised. The multipart upload contract and role/privacy boundaries have regression tests.
- Full app translation, rides/driver flows, public named doctor profiles and call-a-doctor pricing are not supplied by these backend routes; the older unrelated screens remain unrouted.
- Payment/provider webhooks and SMS/USSD callbacks are machine integrations; they should not get public browser forms that bypass provider authentication. Existing operator callback screens expose the human workflow.
- Application lists are not paginated by the backend; no client pagination cursor is invented. No application edit/withdraw endpoint exists after submission.

- Map QA additionally verified real street tiles, accessible pin popups, five filtered emergency pins and the offline-overview toggle. A 375px About preview overflow found during QA was fixed and rechecked.
- Final automated checks: production/PWA build and 49 tests pass; lint has zero errors and seven existing hook warnings in the unrouted legacy map/ride files.

## Complete route inventory

Every route is listed below with its human-facing correspondent or its machine-integration purpose.

| Backend route | Frontend / purpose |
|---|---|
| `GET /profile` | /app/profile; /app/profile/household |
| `PUT /profile` | /app/profile; /app/profile/household |
| `POST /profile/household` | /app/profile; /app/profile/household |
| `DELETE /profile/household/{member_id}` | /app/profile; /app/profile/household |
| `GET /facilities` | /app/facilities; /app/facilities/:id; shared facility pickers |
| `GET /facilities/{facility_id}` | /app/facilities; /app/facilities/:id; shared facility pickers |
| `POST /facilities` | /admin |
| `PUT /facilities/{facility_id}` | /admin |
| `POST /triage` | /app/triage; /app/triage/:resultId (writes sync through /sync) |
| `GET /triage` | /app/history; triage linking |
| `GET /triage/{result_id}` | /app/triage; /app/triage/:resultId (writes sync through /sync) |
| `GET /consultations` | /app/consults; /app/consult/new; /app/consult/:id; doctor conversation |
| `POST /consultations` | /app/consults; /app/consult/new; /app/consult/:id; doctor conversation |
| `GET /consultations/{consultation_id}` | /app/consults; /app/consult/new; /app/consult/:id; doctor conversation |
| `POST /consultations/{consultation_id}/messages` | /app/consults; /app/consult/new; /app/consult/:id; doctor conversation |
| `POST /consultations/{consultation_id}/voice-note-upload-url` | /app/consults; /app/consult/new; /app/consult/:id; doctor conversation |
| `GET /consultations/{consultation_id}/voice-note/{message_id}` | /app/consults; /app/consult/new; /app/consult/:id; doctor conversation |
| `POST /sync` | Triage wizard / message outbox via SyncManager |
| `GET /payments` | /app/history; receipt; /app/consult/:id/pay |
| `POST /payments/initiate` | /app/consult/:id/pay |
| `GET /payments/{payment_id}` | /app/history; receipt; /app/consult/:id/pay |
| `POST /payments/{payment_id}/simulate` | /admin/payments |
| `POST /payments/webhook` | Machine integration: Fapshi confirmation; patient Payment polls the result |
| `GET /doctor/queue` | /doctor; /doctor/case/:id |
| `GET /doctor/queue/{consultation_id}` | /doctor; /doctor/case/:id |
| `PUT /doctor/queue/{consultation_id}/claim` | /doctor; /doctor/case/:id |
| `PUT /consultations/{consultation_id}/close` | /doctor/case/:id |
| `POST /consultations/{consultation_id}/prescription` | /doctor/case/:id |
| `POST /consultations/{consultation_id}/referral` | /doctor/case/:id |
| `GET /prescriptions/{code}` | /rx; /rx/:code |
| `GET /referrals/{code}` | /ref; /ref/:code |
| `GET /push/vapid-public-key` | Profile notification controls (existing push feature flag); browser subscription helper |
| `POST /push/subscribe` | Profile notification controls (existing push feature flag); browser subscription helper |
| `DELETE /push/subscribe` | Profile notification controls (existing push feature flag); browser subscription helper |
| `POST /channels/sms` | Machine integration: signed SMS/USSD provider callbacks; nurse requests appear at /operator |
| `POST /channels/ussd` | Machine integration: signed SMS/USSD provider callbacks; nurse requests appear at /operator |
| `GET /operator/callbacks` | /operator |
| `PUT /operator/callbacks/{request_id}/handle` | /operator |
| `POST /operator/dispatch-log` | /operator/dispatch |
| `POST /appointments` | /app/appointments |
| `GET /appointments` | /app/appointments; /admin/appointments |
| `DELETE /appointments/{appointment_id}` | /app/appointments |
| `PUT /appointments/{appointment_id}/confirm` | /app/appointments; /admin/appointments |
| `POST /lab-requests` | /app/labs; /app/labs/:id; /operator/labs lookup |
| `GET /lab-requests` | /app/labs; /app/labs/:id; /operator/labs lookup |
| `GET /lab-requests/{request_id}` | /app/labs; /app/labs/:id; /operator/labs lookup |
| `PUT /lab-requests/{request_id}/status` | /operator/labs |
| `POST /blood-requests` | /app/blood |
| `GET /blood-requests` | /operator/blood |
| `POST /emergency` | EmergencyShare on RED triage result |
| `GET /operator/emergencies` | /operator/emergencies |
| `POST /health-tips` | /admin/tips |
| `PUT /health-tips/{tip_id}` | /admin/tips |
| `DELETE /health-tips/{tip_id}` | /admin/tips |
| `PUT /doctor/presence` | /doctor availability control |
| `GET /doctors/available` | Patient Home; new-consultation availability |
| `GET /health-tips` | /tips; patient Home |
| `POST /anonymous/session` | /ask; /ask/:id (session, consultation, text outbox, payment) |
| `POST /anonymous/consultations` | /ask; /ask/:id (session, consultation, text outbox, payment) |
| `GET /anonymous/consultations` | /ask; /ask/:id (session, consultation, text outbox, payment) |
| `GET /anonymous/consultations/{consultation_id}` | /ask; /ask/:id (session, consultation, text outbox, payment) |
| `POST /anonymous/consultations/{consultation_id}/messages` | /ask; /ask/:id (session, consultation, text outbox, payment) |
| `POST /anonymous/payments/initiate` | /ask; /ask/:id (session, consultation, text outbox, payment) |
| `GET /i18n/{locale}` | /languages |
| `POST /doctor-applications/uploads` | /apply/doctor |
| `POST /doctor-applications` | /apply/doctor |
| `GET /doctor-applications/{application_id}` | /apply/status |
| `GET /admin/doctor-applications` | /admin/applications |
| `GET /admin/doctor-applications/{application_id}` | /admin/applications |
| `PUT /admin/doctor-applications/{application_id}` | /admin/applications |
| `POST /admin/doctor-applications/{application_id}/approve` | /admin/applications |
| `POST /admin/doctor-applications/{application_id}/reject` | /admin/applications |
| `POST /admin/doctor-applications/{application_id}/resend-invite` | /admin/applications |
