# Pending before deployment

These items are not done yet and must be dealt with before the doctor-verification work (staff pool, doctor applications) goes to a real environment. Tick each one as you finish it, and add new items here as they come up.

## Blocking: do before the first deploy of this work

- [ ] **Re-create any existing staff accounts in the staff pool.**
  - Doctor, Operator and Admin groups no longer exist in the patient pool, so any staff account that lived there loses its role on deploy.
  - Re-create these people in the staff pool (`Backend/RUNBOOK.md` §5).
  - If you skip this, those people sign in as patients.
- [ ] **Create the first Admin** in the staff pool from the CLI (`Backend/RUNBOOK.md` §5). Without an Admin, nobody can review doctor applications.
- [ ] **Set the real staff URLs** in `Backend/cdk.json` for each environment:

  ```json
  "staffLoginUrl": "https://<frontend>/staff/sign-in",
  "staffCallbackUrls": ["https://<frontend>/auth/callback"],
  "staffLogoutUrls": ["https://<frontend>/sign-in"]
  ```

  The invitation email links to `staffLoginUrl`. Today it points to `http://localhost:5173/sign-in`. Agree the exact staff sign-in route with the frontend developer.
- [ ] **Confirm the reviewer alert subscription.**
  - Each new application emails `reviewerEmail`, which falls back to `alertEmail`.
  - Set `reviewerEmail` in `cdk.json` if someone other than the ops contact reviews applications.
  - After the deploy, click the SNS confirmation link that arrives by email. Until you do, no alerts are delivered.
- [ ] **The frontend must switch staff screens to the staff pool.** Give the frontend developer the `HealthTrack-Auth-<env>` outputs `StaffCognitoAuthority`, `StaffAppClientId` and `StaffHostedUiDomain`. Patients keep the existing values.

## After the first deploy: verify once in dev

- [ ] **Refresh-token rotation took effect.** In the Cognito console, open the staff app client. The refresh token rotation setting should be on, with a 10 s grace period. Refreshing tokens should return a new refresh token each time.
- [ ] **First sign-in walkthrough.** Approve a test application and sign in with the temporary password. You should be asked for a new password, then shown a QR code, then asked for a code, then reach the dashboard.
- [ ] **The 24-hour session.** After 24 hours, a refresh fails and the user has to sign in again.
- [ ] **Lost-authenticator reset.** Run `admin-delete-software-token` on a test user. Their next sign-in should ask them to scan a new QR code.

## Email: waiting for a domain

Today, applicants get no "application received" or "application rejected" email; they check status on the status page with their application ID. Approval invitations still arrive, sent by Cognito's default sender (about 50 per day).

- [ ] **Buy or choose the domain**, e.g. `carebridge.cm`.
- [ ] **Configure it** in `Backend/cdk.json` for each environment:

  ```json
  "emailDomain": "carebridge.cm",
  "senderEmail": "no-reply@carebridge.cm"
  ```

  Then deploy. This creates the SES domain identity, switches the staff pool's emails to SES, and turns on applicant emails.
- [ ] **Add the DKIM records.** Copy the 3 DKIM CNAME records from the SES console (Verified identities → the domain) into the domain's DNS. Wait for the status to show Verified.
- [ ] **Ask for SES production access** (SES console → Account dashboard → Request production access). In the sandbox, SES only sends to verified addresses, so real applicants get nothing.
- [ ] **Recommended:** add SPF and DMARC records so the emails don't land in spam.

## Policy and operations decisions

- [ ] **The review promise.** The applicant screen and the "received" email say "usually within 24 hours". Name who reviews and who covers weekends. Waspito advertises 24–48 hours.
- [ ] **Data-protection review (Cameroon 2024 personal data law).**
  - Documents: we store images of national IDs, passports and selfies in us-east-1, which is a cross-border transfer.
  - Retention, set by S3 lifecycle and object tags: unsubmitted uploads are deleted after 1 day, rejected applications' documents after 90 days, and approved doctors' documents are kept.
  - Rejected application records: they are kept in full in DynamoDB, so a re-application after a fraud rejection can be detected. Decide whether old rejected records should have their personal fields removed after a period.
  - Add a privacy notice to the application form.
- [ ] **Public upload abuse (accepted for now).**
  - At most 200 applications can wait for review; beyond that, new applications get 503. This keeps permanent storage under about 5 GB.
  - Upload reservations are throttled to 1 per second across all users. Each one can hold 25 MB of drafts that S3 deletes after 1 day.
  - A determined script could still fill the queue (blocking real doctors until admins reject the junk) or cost a few dollars a day in short-lived drafts.
  - The fix is AWS WAF per-IP rate limiting (about $5–6/month), or an email code check before upload. Add it if abuse shows up in the dashboard or the bill.
- [ ] **Email squatting.** Someone who applies with a real doctor's email blocks that doctor (409) until an admin rejects the impostor. Verifying the email with a code before upload would close this. It is deferred until SES (above) is set up.
- [ ] **ONMC register access.** Admins verify the number against the ONMC register by hand. Find out whether the Order can give API or bulk access, which would let this check be automated later.
