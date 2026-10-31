# Live integration check — 2026-10-31

Read-only checks against the API configured in `Frontend/.env.local`. No application, document, account, email, payment or infrastructure was created or changed.

| Check | Result |
|---|---|
| Facilities | `GET /facilities` → 200, expected `facilities` array present |
| English language bundle | `GET /i18n/en` → 200, expected `triage` section present |
| Public doctor-application status | `GET /doctor-applications/00000000-0000-4000-8000-000000000000` → 403, API Gateway `Missing Authentication Token` |
| Local patient sign-in configuration | Authority and client ID configured |
| Local staff sign-in configuration | Staff authority and client ID missing |
| Google Embed configuration | Key absent; the keyless OpenStreetMap fallback remains available |
| Default AWS access | Credentials work, but no `HealthTrack-Auth-*` or `HealthTrack-Api-*` stacks are visible in the configured API region |

The synthetic application ID is deliberately nonexistent. With the new public handler deployed, it should return the handler's JSON 404 (`Application not found`), not API Gateway's 403. Facilities and translations work through the same base URL, so this check establishes that the new route is unavailable at the currently configured API stage; it does not establish the deployment's account or owner.

## What is needed next

The owner must identify the AWS profile/environment that owns CareBridge, or provide the location of its deployment outputs. Do not deploy into the unrelated default account or choose another project's profile. The profile question was raised in the chat.

Then:

1. Read the matching Auth/API deployment outputs and verify that they correspond to the configured API.
2. Populate the missing `VITE_COGNITO_STAFF_*` settings in gitignored local/deployment configuration.
3. Confirm that the new public and protected doctor-application routes are deployed.
4. Continue the live S3/document and staff sign-in checks described in `Backend/PENDING_BEFORE_DEPLOY.md`, with explicit handling of account creation and password/MFA entry.

Frontend implementation remains pushed on `feat/frontend-redesign`. This live check does not replace the earlier 49-test/build results and does not sign off MFA, document uploads, invitations or deployment.
