# Health Track backend: operations runbook

Region: **us-east-1 only**. Account: `019141478309`. Environment names: `dev`, `staging`, `prod`.
Alerts (alarms, budget, operator emergencies) go to the address in `cdk.json` → `<env>.alertEmail`.

## 1. Architecture at a glance

| Stack                          | Holds                                                                                           | Notes                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `HealthTrack-Data-<env>`       | KMS key `alias/health-track-<env>`, 19 DynamoDB tables, voice-notes / i18n / access-log buckets | Stateful. RETAIN + deletion protection + termination protection in prod |
| `HealthTrack-Governance-<env>` | Alert SNS topic, $3 AWS Budget, CloudTrail (dev only, one per account)                          |                                                                         |
| `HealthTrack-Auth-<env>`       | Cognito user pool, app client, hosted UI domain, 2 triggers                                     | Staff need TOTP MFA                                                     |
| `HealthTrack-Api-<env>`        | One REST API, 17 domain Lambdas, push pipeline + DLQ, alarms, dashboard                         | Stateless; safe to redeploy                                             |

Runtime secrets live in **SSM Parameter Store** under `/health-track/<env>/` (see `scripts/bootstrap_params.py`).

### 1a. Ownership (fill in the names; the roles are fixed)

| Role                 | Owns                                                             | Name / contact                           |
| -------------------- | ---------------------------------------------------------------- | ---------------------------------------- |
| Backend lead         | Architecture, deploy approval, this runbook, cost (budget owner) | _team lead_                              |
| On-call operator     | Alarm and emergency-alert response (§3, §8)                      | `alertEmail` in `cdk.json`               |
| Clinical lead        | Triage rule sign-off, doctor licence checks (§5)                 | _clinician (University of Buea partner)_ |
| Data protection lead | Health-data incidents, retention, legal (§8)                     | _to be named_                            |

Every AWS resource carries the tags `Project=HealthTrack`, `Environment=<env>` and `Owner=carebridge-backend`.
An infrastructure change needs three things: a passing `make test nag audit`, a reviewed `make diff`, and the backend lead's approval.

## 2. Deploy / rollback

```bash
cd Backend
make install                 # once
make test && make nag        # unit + infrastructure tests, AWS Solutions rule pack (must be clean)
make audit                   # known-vulnerability scan of CDK deps and Lambda layers
make diff ENV=dev            # review the change set
make deploy ENV=dev          # Data -> params -> all stacks
make seed ENV=dev            # facilities + translations (idempotent)
```

**Rollback:** redeploy the previous git commit (`git checkout <sha> && make deploy`). CloudFormation rolls back a
failed stack update automatically. A code-only change never replaces the Data stack.

**Smoke test after every deploy:**

```bash
API=$(aws cloudformation describe-stacks --stack-name HealthTrack-Api-dev --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)
curl -s "${API}facilities" | head -c 200        # 200, non-empty after seeding
curl -s "${API}push/vapid-public-key"           # 200 with public_key
curl -s -o /dev/null -w "%{http_code}\n" "${API}doctor/queue"   # 401 (with CORS header)
```

## 3. Alarms and what to do

| Alarm                                | Meaning                                    | First steps                                                                                                                                                                                                                             |
| ------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Api5xx`                             | A handler returned 500 or a Lambda crashed | 1. Open the `HealthTrack-<env>` dashboard and find the domain. 2. Run `aws logs tail /aws/lambda/HealthTrack-<Domain>-<env> --since 30m`. 3. Check the X-Ray trace map (it includes DynamoDB/S3/HTTP subsegments).                      |
| `Api4xxSpike`                        | ≥100 4xx responses in 5 min                | Likely causes: expired tokens after a Cognito change, a broken client release, or abuse. Check access logs `/health-track/<env>/api-access` by `ip` and `resourcePath`. If it's abuse, lower the per-route throttles in `api_stack.py`. |
| `ApiLatencyP95`                      | p95 > 5 s for 15 min                       | Cold starts or a slow dependency (Fapshi). Check `Duration` per domain and the X-Ray subsegments.                                                                                                                                       |
| `PushSendErrors` / `PushDlqNotEmpty` | Notifications failing after 2 retries      | Inspect the messages in `HealthTrack-PushDLQ-<env>`. Usually the VAPID parameter is missing or a push service is down. Purge the queue after fixing (notifications are best-effort).                                                    |
| `LambdaThrottles`                    | Account concurrency exhausted              | **The account limit is 10 concurrent executions, shared with other projects.** Request an increase under Service Quotas → Lambda → Concurrent executions.                                                                               |
| Budget 80% actual / 100% forecast    | Spend approaching $3                       | Open Cost Explorer filtered by tag `Project=HealthTrack`. Look for log ingestion spikes or a runaway client.                                                                                                                            |

### Severity and escalation

| Severity | Business impact                                       | Examples                                                                   | Response              | Escalate to                                                                   |
| -------- | ----------------------------------------------------- | -------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------- |
| SEV1     | Patients cannot get urgent guidance or reach a doctor | API 5xx on triage/consultations, sign-in down, payments confirming nothing | Immediately, any hour | Backend lead, then clinical lead (switch patients to phone/facility guidance) |
| SEV2     | A feature is degraded                                 | Push failing, voice notes failing, latency alarm                           | Same day              | Backend lead                                                                  |
| SEV3     | No patient impact                                     | Budget forecast, 4xx spike from a known client                             | Next working day      | Backend lead                                                                  |

The on-call operator always handles emergency-location alerts (operator topic) as SEV1.

## 4. Payments (Fapshi)

- **Simulated payments:** outside prod, with credentials set to `UNSET`, payments are simulated. An Admin confirms with
  `POST /payments/{payment_id}/simulate`.
- **Enable real payments:**
  1. Run `python scripts/bootstrap_params.py --env <env> --fapshi "apiuser:apikey"`. dev/staging use
     `sandbox.fapshi.com` and prod uses `live.fapshi.com`.
  2. In the Fapshi dashboard, set the webhook URL to `<ApiUrl>payments/webhook`.
- **Webhook trust:** the webhook never trusts its body; it re-reads the transaction from Fapshi.
- **Refunds:** a payment confirmed after its consultation is no longer pending is stored with `needs_refund = true`.
  Query for these and refund them manually.

## 5. Staff onboarding (doctors, operators, admins)

Staff accounts live in the **staff user pool** (`HealthTrack-Auth-<env>` output `StaffUserPoolId`). It has no self sign-up, TOTP MFA is mandatory, tokens last 10 minutes, and sessions last 24 hours. Patients never become staff: the patient pool has only the `Patient` group.

**Doctors** apply through `POST /doctor-applications` (ONMC certificate, ONMC card, degree, CNI or passport, and a selfie holding both cards). An Admin reviews the application in the admin console:

1. Look up the ONMC number in the ONMC register (or call the Order), then tick `onmc_register_verified`.
2. Check that the name and photo match across the CNI or passport, the ONMC card, the certificate and the degree. Tick `documents_consistent`.
3. Check the selfie: the same face as the ID photos, with both cards visible and readable next to the face. Tick `selfie_matches`.
4. Approve. This creates the account and Cognito emails a temporary password (valid for 7 days). Otherwise, reject with a reason.

If approve fails part-way (500), the application stays `approving`; press **Approve** again to finish it. Reject is refused in that state on purpose, because the account may already exist.

**Never create Doctor, Operator or Admin groups in the patient pool.** The API ignores staff groups in patient-pool tokens (`STAFF_POOL_ISSUER`), so such a group would do nothing, but it would confuse whoever reads the console next.

If a doctor's invitation expired or was lost, use **resend invite** (`POST /admin/doctor-applications/{id}/resend-invite`).

**Operators and Admins** are created from the CLI:

```bash
POOL=$(aws cloudformation describe-stacks --stack-name HealthTrack-Auth-$ENV   --query "Stacks[0].Outputs[?OutputKey=='StaffUserPoolId'].OutputValue" --output text)
aws cognito-idp admin-create-user --user-pool-id $POOL --username person@example.org   --user-attributes Name=email,Value=person@example.org Name=email_verified,Value=true Name=name,Value="Full Name"   --desired-delivery-mediums EMAIL
aws cognito-idp admin-add-user-to-group --user-pool-id $POOL --username person@example.org --group-name Admin
```

At first sign-in they set a password and enrol TOTP. Cognito enforces both.

**Lost authenticator.** Confirm the person's identity outside the app, for example by a call to a number already on file. Then clear their TOTP registration with `aws cognito-idp admin-delete-software-token --user-pool-id $POOL --username <email>`. This is AWS's admin TOTP reset, available since August 2026, so update the AWS CLI if the command is missing. At their next sign-in they enrol a new authenticator. Confirm this once in dev (see `PENDING_BEFORE_DEPLOY.md`). **Do not delete and re-create the user:** a new user gets a new `sub`, which orphans their profile and their consultation history.

**Offboarding.** Run `admin-user-global-sign-out`, then `admin-disable-user`. Because the refresh token expires within 24 hours and access tokens within 10 minutes, any remaining session ends quickly.

## 6. Secrets rotation

```bash
python scripts/bootstrap_params.py --env <env> --rotate channels/gateway-token     # then update the telco gateway
python scripts/bootstrap_params.py --env <env> --rotate push/vapid-private-key     # re-generates the pair; clients re-subscribe
```

Lambdas cache parameters per container. To force a refresh, redeploy the Api stack.

## 7. Backup and disaster recovery

- **Objectives:** RPO 5 minutes (DynamoDB PITR, 35-day window); RTO 4 hours (single-region workload).
- **Restore a table:**
  ```bash
  aws dynamodb restore-table-to-point-in-time --source-table-name HealthTrack-Consultations-<env> \
    --target-table-name HealthTrack-Consultations-<env>-restore --use-latest-restorable-time \
    --sse-specification-override Enabled=true,SSEType=KMS,KMSMasterKeyId=alias/health-track-<env>
  ```
  Validate the copy. Then either point the Lambdas at it (swap the names via CDK) or copy the items back.
- **Voice notes:** bucket versioning keeps overwritten or deleted objects for 30 days.
- **Region outage:** redeploy all stacks from git. Data restores have to wait for the region to return: there is no
  cross-region copy, a deliberate cost trade-off at this scale. The PWA keeps working offline for triage and the facility directory.
- **Test the restore quarterly.** The last test is recorded in §10.

## 8. Security incident playbook

1. **Contain:** depending on the incident:
   - disable the affected Cognito user (`admin-disable-user`);
   - rotate the relevant SSM parameter (§6);
   - set the abused route's stage throttle to 0 in `api_stack.py` and deploy.
2. **Investigate:** use these sources:
   - CloudTrail (management events, DynamoDB data events on health tables, voice-note object events) in the trail bucket;
   - API access logs;
   - Lambda logs (no request bodies are logged).
3. **Recover:** use a PITR restore (§7) for tampered data, and redeploy from a known-good commit.
4. **Notify:** if health data is involved, inform the data protection lead within 72 hours and document the timeline.
5. **Learn:** hold a blameless post-mortem, and add a test or alarm that would have caught the problem.

### 8a. Operational readiness review (ORR): run it before every new environment and quarterly

| #   | Check                                                   | 2026-10-22 dev result                                                                           |
| --- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | `make test nag audit` clean                             | 424 tests pass; cdk-nag 0 unsuppressed findings; pip-audit: no known vulnerabilities            |
| 2   | `make diff` shows no drift                              | 0 stacks with differences                                                                       |
| 3   | Smoke test (§2) + authenticated end-to-end journey      | 22/22 checks (triage → consult → pay → doctor → prescription → close; cross-user access denied) |
| 4   | Alarms exist, are OK, and notify a confirmed subscriber | 6 alarms OK; **email subscriptions pending confirmation**                                       |
| 5   | Backup restore drill                                    | PITR restore of Facilities: 250 s, 40/40 items                                                  |
| 6   | Load and throttle test                                  | 300 requests at ~8 rps: 100% 200, p95 508 ms; route throttle returns 429 with CORS              |
| 7   | Secrets are in SSM, none in code or environment         | 4 parameters; no secrets in templates                                                           |
| 8   | Staff MFA enforced                                      | Staff pool `MfaConfiguration: ON` (re-verify after the staff-pool deploy: new user forced through TOTP setup) |
| 9   | Runbook owners named (§1a)                              | **Names pending**                                                                               |

### 8b. Continuous improvement

- Every SEV1/SEV2 gets a blameless post-mortem within 5 working days. Each action becomes a tracked issue with an owner.
- Review these inputs monthly:
  - alarms fired and DLQ contents;
  - the `Business events` dashboard widget (triage RED counts, consultations, payments);
  - cost against the budget;
  - AWS Security Bulletins (https://aws.amazon.com/security/security-bulletins/);
  - Python/Lambda runtime and dependency advisories (`make audit`).
- Prioritise improvements by patient impact first, then cost.

## 9. Monthly review (cost, security, operations)

- Compare Cost Explorer by `Project=HealthTrack` against the $3 budget. The KMS key is about $1 of it.
- Run `make nag audit`, run `npm audit` on the frontend, and check Lambda runtime deprecation dates.
- Review the alarms that fired, the DLQ contents, and the Cognito staff list with each person's MFA status.

## 10. Change log of verifications

| Date       | What                                                                         | Result                                    |
| ---------- | ---------------------------------------------------------------------------- | ----------------------------------------- |
| 2026-10-22 | Rebuild per `audit/03-backend-cloud-audit.md`; WA Tool review                | See `audit/04-remediation-report.md`      |
| 2026-10-22 | PITR restore drill (HealthTrack-Facilities-dev → -restoretest, then deleted) | 250 s, 40/40 items                        |
| 2026-10-22 | Load test: 300 × GET /facilities; burst of 40 × code lookup                  | 0 errors, p95 508 ms; throttling verified |
| 2026-10-22 | End-to-end journey with temporary users (deleted afterwards)                 | 22/22                                     |

## 11. Cost model (us-east-1, on-demand)

| Traffic              | API GW | Lambda | DynamoDB | Logs/X-Ray/CloudTrail | KMS key | **Total / month**                                  |
| -------------------- | ------ | ------ | -------- | --------------------- | ------- | -------------------------------------------------- |
| 200 req/day (launch) | $0.02  | <$0.01 | ~$0.01   | ~$0.05                | $1.00   | **≈ $1.10**                                        |
| 2,000 req/day        | $0.21  | ~$0.05 | ~$0.10   | ~$0.40                | $1.00   | **≈ $1.80**                                        |
| 20,000 req/day       | $2.10  | ~$0.50 | ~$1.00   | ~$3.00                | $1.00   | **≈ $7.60** (moving to HTTP API saves about $1.50) |

The model assumes about 3 DynamoDB operations and about 1.5 KB of logs per request. It excludes SMS/email and Fapshi fees.
