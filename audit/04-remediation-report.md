# CareBridge backend: cloud remediation and Well-Architected review

|                 |                                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Scope**       | Every finding in [03-backend-cloud-audit.md](03-backend-cloud-audit.md) (CLD-01 to CLD-36), plus the backend code defects it references |
| **Environment** | `dev`, account `019141478309`, **us-east-1 only** (owner decision)                                                                      |
| **Date**        | 22 October 2026                                                                                                                         |
| **Constraints** | ≤ $3/month at ~200 requests/day; one customer-managed KMS key; no WAF; one API; backend only (hosting and CI deferred)                  |
| **Operations**  | [Backend/RUNBOOK.md](../Backend/RUNBOOK.md)                                                                                             |

---

## 1. Result in one table

|                                            | Before                            | After                                                                                                       |
| ------------------------------------------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| CloudFormation stacks                      | 14                                | **4** (Data, Governance, Auth, Api)                                                                         |
| API Gateways / base URLs                   | 11                                | **1**                                                                                                       |
| Lambda functions                           | 69                                | **21** (17 domain functions, 2 Cognito triggers, 2 CDK helpers)                                             |
| CloudFormation resources                   | 664                               | **~370**                                                                                                    |
| NAT gateway, VPC, Elastic IP               | running, unused                   | **deleted**                                                                                                 |
| Secrets Manager secrets                    | 4 (random placeholder values)     | **0**: replaced by free SSM SecureString parameters                                                         |
| Encryption                                 | AWS-owned keys                    | **Customer-managed KMS key** on all 19 tables, voice notes, logs, alert topics and parameters               |
| Logs                                       | Full request bodies, kept forever | **No bodies**, JSON structured logs, **30-day retention**, KMS-encrypted                                    |
| Alarms / dashboard / tracing / audit trail | none                              | **6 alarms**, dashboard with business KPIs, X-Ray incl. dependency subsegments, CloudTrail with data events |
| Idle cost                                  | **≈ $38.10 / month**              | **≈ $1.00 / month** (the KMS key); **≈ $1.10** at 200 requests/day                                          |
| Sign-in on the deployed system             | broken (`invalid_scope`)          | **works**                                                                                                   |
| Paid consultation reaches a doctor         | never                             | **verified end to end**                                                                                     |
| Real data in the backend                   | 0 facilities, 0 translations      | **40 facilities, 3 locales** seeded                                                                         |

---

## 2. What was done

1. **Removed everything that served nothing:**
   - the NAT gateway, VPC and Elastic IP;
   - 4 Secrets Manager secrets;
   - the unused deploy bucket;
   - all 11 REST APIs (replaced by one);
   - 11 retained API Gateway CloudWatch roles;
   - 22 never-expiring log groups;
   - the dead duplicate rules package;
   - the unused `jwt_util`;
   - the unused Payments index.

   All 14 old stacks were deleted. Their data was verified empty first: 0 rows, 0 users, 0 objects.

2. **Rebuilt the infrastructure** in four stacks, with stateful and stateless resources separated:

   | Stack                        | Contents                                                       |
   | ---------------------------- | -------------------------------------------------------------- |
   | `HealthTrack-Data-dev`       | KMS key, 19 tables, 3 buckets                                  |
   | `HealthTrack-Governance-dev` | Alert topic, $3 budget, CloudTrail                             |
   | `HealthTrack-Auth-dev`       | Cognito                                                        |
   | `HealthTrack-Api-dev`        | One API, 17 domain functions, push pipeline, alarms, dashboard |

3. **Fixed the backend code the cloud findings depend on:**
   - payments;
   - ownership and authorization checks;
   - the triage key schema;
   - push notifications;
   - telco webhook authentication;
   - the public-lookup data projection;
   - the seed scripts;
   - Cognito triggers;
   - PII in logs.
4. **Redeployed** to us-east-1, **seeded** the data, and **verified** everything live (§5).
5. **Ran the AWS Well-Architected Tool** review twice: once as rebuilt, then again after closing the gaps that could be closed (§6).

---

## 3. Finding-by-finding status

✅ fixed and verified · 🟡 partly fixed (reason given) · ⛔ not fixable in code (owner action, §8)

| ID     | Finding                                              | Status          | What changed                                                                                                                                                                                                                                                                                                                      |
| ------ | ---------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLD-01 | Webhook public, unverified, lookup broken            | ✅              | The body is never trusted: the webhook re-reads the transaction from the Fapshi status API, looks it up by primary key, checks the amount, and updates payment and consultation atomically (`TransactWriteItems`). The route is throttled to 2 rps. Admin-only simulation is used outside prod.                                   |
| CLD-02 | Shared-layer export lock                             | ✅              | Layers live in the same stack as their functions. No cross-stack layer export.                                                                                                                                                                                                                                                    |
| CLD-03 | Health data in logs forever                          | ✅              | Data trace off. JSON access logs without bodies. 30-day retention on every log group, KMS-encrypted. Phone numbers removed from logs and receipts.                                                                                                                                                                                |
| CLD-04 | Region inconsistency                                 | ✅              | us-east-1 is hard-wired in `config.py`; any other region raises an error. Makefile, scripts, tests and `.env.example` all agree.                                                                                                                                                                                                  |
| CLD-05 | Unused NAT gateway ($36.50/month)                    | ✅              | VPC, NAT and EIP deleted. An infrastructure test fails if any of them reappears.                                                                                                                                                                                                                                                  |
| CLD-06 | Push broken at every layer                           | ✅              | VAPID key pair generated into SSM. `pywebpush` layer built for arm64 / Python 3.14. Webhook and doctor replies publish events, which trigger the sender (retries + dead-letter queue). The backend accepts the frontend's field names. Verified live.                                                                             |
| CLD-07 | Random placeholder secrets                           | ✅              | `scripts/bootstrap_params.py` creates the SSM SecureString parameters. Payments run in simulation mode until real Fapshi credentials are set (RUNBOOK §4).                                                                                                                                                                        |
| CLD-08 | No hosting; localhost-only Cognito                   | 🟡              | Callback and logout URLs and CORS origins are per-environment settings in `cdk.json`. Hosting is deferred at your request.                                                                                                                                                                                                        |
| CLD-09 | Public endpoints unthrottled, unsigned, over-sharing | ✅              | Per-route throttles. Telco gateway token checked in constant time. Public prescription and referral lookups no longer return patient, doctor or consultation ids. WAF not added (budget, your decision).                                                                                                                          |
| CLD-10 | No CORS on gateway errors                            | ✅              | `DEFAULT_4XX`/`DEFAULT_5XX` carry CORS headers. Verified live on 401, 403 and 429.                                                                                                                                                                                                                                                |
| CLD-11 | Cognito not production-ready                         | ✅              | TOTP MFA; **staff groups are removed from the token unless TOTP is enabled** (verified live). 12-character passwords. Email-only sign-in (no SMS cost or sandbox). No auto-confirm. Deletion protection in prod. Staff onboarding runbook. **Remaining:** the default Cognito sender (~50 emails/day) until an SES domain exists. |
| CLD-12 | Destroy then redeploy fails                          | ✅              | RETAIN only in prod.                                                                                                                                                                                                                                                                                                              |
| CLD-13 | Health tables deletable                              | ✅              | Prod: RETAIN, deletion protection, termination protection. Dev stays disposable.                                                                                                                                                                                                                                                  |
| CLD-14 | Deploy drift                                         | 🟡              | Redeployed from this code: `cdk diff` shows 0 differences. CI/CD deferred at your request.                                                                                                                                                                                                                                        |
| CLD-15 | Wildcard IAM                                         | ✅              | One role per domain function, with table-level grants (read-only roles for public functions). Dead S3 managed policies removed.                                                                                                                                                                                                   |
| CLD-16 | Voice-notes bucket weaker than plan                  | ✅              | SSE-KMS with bucket key, SSL-only, versioning, access logs. The IA transition (which raised cost) is gone.                                                                                                                                                                                                                        |
| CLD-17 | Timeouts above API Gateway's 29 s                    | ✅              | 10 s, or 20 s for Fapshi callers. Triggers 10 s. Memory set from measurements (§5).                                                                                                                                                                                                                                               |
| CLD-18 | Emergency alerts go nowhere; 24 h retention          | ✅              | Operator topic subscribed to `josuefotseu02@gmail.com`. Emergency records kept 365 days.                                                                                                                                                                                                                                          |
| CLD-19 | Triage key lets results shadow each other            | ✅              | Partition key is `result_id` only. Conditional writes.                                                                                                                                                                                                                                                                            |
| CLD-20 | 11 API Gateway account roles                         | ✅              | Exactly one.                                                                                                                                                                                                                                                                                                                      |
| CLD-21 | No observability                                     | ✅              | 6 alarms, a dashboard (incl. business KPIs from logs), X-Ray with DynamoDB/S3/HTTP subsegments, API access logs.                                                                                                                                                                                                                  |
| CLD-22 | No audit trail                                       | ✅              | Multi-region CloudTrail with log-file validation, plus data events on health tables and voice-note objects.                                                                                                                                                                                                                       |
| CLD-23 | Environments not separated                           | 🟡              | Separate per-environment configuration. All environments share one account; see §8.                                                                                                                                                                                                                                               |
| CLD-24 | Fapshi URL hard-coded to live                        | ✅              | Sandbox outside prod, live only in prod.                                                                                                                                                                                                                                                                                          |
| CLD-25 | No dead-letter queues                                | ✅              | SQS DLQ plus 2 retries on the async push path; DLQ alarm.                                                                                                                                                                                                                                                                         |
| CLD-26 | CDK CLI and library mismatch                         | ✅              | Pinned `aws-cdk-lib==2.273.0` and CLI `2.1146.0` (the newest CLI cannot read 2.274's assembly).                                                                                                                                                                                                                                   |
| CLD-27 | Shared account, long-lived keys                      | ⛔ / correction | **Correction to the audit:** user `JoshuaER` has **no access keys** and deploys with temporary `aws login` credentials; root has MFA. Still open: the shared account, and no MFA on `JoshuaER`.                                                                                                                                   |
| CLD-28 | Unused deploy bucket                                 | ✅              | Deleted.                                                                                                                                                                                                                                                                                                                          |
| CLD-29 | 51 named exports                                     | ✅              | Only CDK-generated references between 4 stacks remain.                                                                                                                                                                                                                                                                            |
| CLD-30 | Empty account in hand-built ARNs                     | ✅              | Synth fails fast without an account.                                                                                                                                                                                                                                                                                              |
| CLD-31 | Deprecated APIs                                      | ✅              | Gone.                                                                                                                                                                                                                                                                                                                             |
| CLD-32 | CORS `*` everywhere                                  | ✅              | Configurable per environment. The prod block in `cdk.json` has a placeholder for the PWA origin.                                                                                                                                                                                                                                  |
| CLD-33 | Committed identifiers                                | 🟡              | `cdk.context.json` is meant to be committed (CDK guidance). `Frontend/.env` now points at the new single API. Untracking it is frontend work.                                                                                                                                                                                     |
| CLD-34 | Unverified JWT decoder                               | ✅              | Deleted.                                                                                                                                                                                                                                                                                                                          |
| CLD-35 | Unused Payments index                                | ✅              | Deleted.                                                                                                                                                                                                                                                                                                                          |
| CLD-36 | Infra tests miss key properties                      | ✅              | 19 new infrastructure tests: no NAT/VPC/secrets; CMK and PITR on every table; route publicity; timeouts; JSON logs; alarms; budget; trail; Cognito; region pin.                                                                                                                                                                   |

**Code defects fixed along the way:**

| ID                             | Fix                           |
| ------------------------------ | ----------------------------- |
| SYS-01                         | Sign-in                       |
| SYS-02, SYS-03, SYS-06, SYS-18 | Payments                      |
| SYS-04                         | Seeding and set serialization |
| SYS-05, SYS-07, SYS-10, SYS-20 | Ownership checks              |
| SYS-24                         | Float/null crashes            |
| SYS-39                         | Lost callbacks                |

---

## 4. Architecture now

```
PWA ──HTTPS──► API Gateway (1 REST API, regional, throttled, Cognito authorizer, request validator, gzip)
                 │  CORS on all responses incl. gateway errors · JSON access logs (no bodies) · X-Ray
                 ▼
     17 domain Lambdas (arm64, Python 3.14, 512 MB, JSON logs, X-Ray SDK)  ──► SSM SecureString (secrets)
                 │                          │
                 ▼                          └─► EventBridge ─► PushSend Lambda ─► Web Push (retries → SQS DLQ)
     DynamoDB ×19 (on-demand, PITR, CMK) · S3 voice notes (SSE-KMS, versioned) · S3 i18n
Cognito (TOTP for staff via pre-token trigger) · KMS CMK · CloudTrail (+data events) · 6 alarms → SNS email · $3 Budget
```

---

## 5. How it was tested

| Test                                                                                                    | Result                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend unit and handler tests                                                                          | **424 passed** (includes new authorization tests: cross-user writes, forged webhooks, amount tampering, unassigned doctors)                                                                                                                                                                                                                                                                     |
| Infrastructure tests (synthesized templates)                                                            | **19/19 passed**                                                                                                                                                                                                                                                                                                                                                                                |
| cdk-nag, AWS Solutions rule pack                                                                        | **0 unsuppressed findings**. 15 documented exceptions, each justified in `health_track/nag_suppressions.py`: public-by-design routes, no WAF (budget), Cognito Plus (budget), and similar.                                                                                                                                                                                                      |
| pip-audit (CDK deps and both Lambda layers)                                                             | **No known vulnerabilities**                                                                                                                                                                                                                                                                                                                                                                    |
| `cdk diff` against the deployed stacks                                                                  | **0 differences**                                                                                                                                                                                                                                                                                                                                                                               |
| Live smoke tests: public routes, 401 with CORS, forged webhook, gateway token, unknown route, preflight | All as expected                                                                                                                                                                                                                                                                                                                                                                                 |
| **Live end-to-end journey** with temporary users (deleted afterwards)                                   | **22/22 passed**. Covers: sign-in → RED triage → consultation (urgency from triage, body tampering ignored) → payment at server fee → Admin simulation → doctor without MFA rejected → doctor with TOTP sees and claims case → cross-patient write blocked → voice note upload/download through SSE-KMS → prescription → public lookup without identifiers → close → push sender runs on arm64. |
| Load test: 300 × GET /facilities at ~8 rps                                                              | **0 errors**; p50 410 ms, p95 508 ms (from this machine); p99 2.9 s on cold starts                                                                                                                                                                                                                                                                                                              |
| Throttle test: burst of 40 on a 2 rps route                                                             | 19 × 429, all with CORS headers                                                                                                                                                                                                                                                                                                                                                                 |
| Backup restore drill (PITR)                                                                             | Table restored in **250 s, 40/40 items**, then deleted                                                                                                                                                                                                                                                                                                                                          |
| Memory right-sizing (128 / 256 / 512 / 1024 MB)                                                         | 512 MB chosen: warm latency 198 → 115 ms for +$0.0007/month                                                                                                                                                                                                                                                                                                                                     |
| Operational health after tests                                                                          | 6/6 alarms OK, DLQ empty, 0 Lambda errors; payment and reply events reached the push sender                                                                                                                                                                                                                                                                                                     |

---

## 6. AWS Well-Architected Tool review

- **Workload:** `HealthTrack-CareBridge-dev`, ID `27b84947a06393a8e06bd004d7dc081e`, in the Well-Architected Tool console in us-east-1.
- **Lenses:** AWS Well-Architected Framework (6 pillars, 57 questions) and the Serverless Lens (9 questions).
- **Milestones:** two are saved, so you can compare them in the console:
  - `1-as-rebuilt (initial honest review)`
  - `2-after-improvements`
- **How it was answered:** every answer selects only practices that are implemented and evidenced. The evidence is in each answer's notes. Unimplemented practices were left unselected, so the Tool reports the real risk. Only practices that cannot exist in a VPC-less serverless design were marked not applicable: private networks, subnets, VPN and load balancers.

### 6.1 Framework lens: risk by pillar

| Pillar                   | High: as rebuilt → final | Medium (final) | No risk (final) |
| ------------------------ | ------------------------ | -------------- | --------------- |
| Operational excellence   | 7 → **3**                | 6              | 2               |
| Security                 | 5 → **2**                | 6              | 3               |
| Reliability              | 2 → **0**                | 8              | 5               |
| Performance efficiency   | 1 → **0**                | 4              | 1               |
| Cost optimization        | 4 → **3**                | 4              | 4               |
| Sustainability           | 0 → **0**                | 6              | 0               |
| **Total (57 questions)** | **19 → 8**               | **34**         | **15**          |

**Serverless Lens:** 2 high → **1 high**, 3 medium, 5 no risk.

### 6.2 What closed the gaps between the two reviews

Each item below is a real change, verified:

- **Dependency tracing:** X-Ray SDK layer; traces show DynamoDB subsegments.
- **Structured logs:** JSON logs, plus business KPIs on the dashboard.
- **Vulnerability scanning:** pip-audit as `make audit`.
- **Load and throttle testing:** run against the live API.
- **Memory right-sizing:** measured, then applied.
- **Backup restore:** drill run.
- **Ownership:** `Owner` tag on all 85 resources.
- **Process documentation** in the runbook:
  - operational readiness review, executed;
  - severity and escalation matrix;
  - post-mortem and improvement loop;
  - cost model at 3 traffic levels.

### 6.3 The 8 + 1 high risks that remain, and why

None of these is missing infrastructure. All of them are organisational, account-level, or frontend work:

| Pillar / question                    | Missing practice                                                    | Why it is still open                                                                              | Who / how                  |
| ------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------- |
| OPS: organisational culture          | Executive sponsor, team empowerment, training                       | Organisational                                                                                    | Team lead                  |
| OPS: observability                   | Real-user (browser) telemetry                                       | Needs frontend code (e.g. CloudWatch RUM, ≈$0.60/month at this traffic)                           | Frontend, with hosting     |
| OPS: ready to support                | Personnel capability / training                                     | Organisational                                                                                    | Team lead                  |
| SEC: securely operate                | Separate AWS accounts; account contacts; MFA on IAM user `JoshuaER` | Account-level, outside the stacks                                                                 | You (§8)                   |
| SEC: application security            | Pen testing, pipeline security, security training                   | Needs CI/CD (deferred) and people                                                                 | Team, after CI             |
| COST: financial management           | Finance partnership, cost culture, usage report                     | Organisational, plus a Cost and Usage Report on a shared account                                  | Team lead                  |
| COST: govern usage                   | Account structure                                                   | Shared account                                                                                    | You (§8)                   |
| COST: monitor usage                  | Detailed billing source (CUR 2.0 export)                            | Account-wide billing export; I didn't create it on a shared account without asking                | One command if you want it |
| Serverless SEC: application security | Runtime protection, security awareness reviews                      | Runtime protection needs paid tooling (Inspector ~$5.70/month for 19 functions breaks the budget) | Revisit when budget grows  |

Most medium risks are of the same kind:

- no CI/CD (your deferral);
- no fault injection or game days;
- no GuardDuty or Config (about $2–4/month together, over budget);
- sustainability practices about region choice and organisational goals.

---

## 7. Cost

| Traffic                       | Monthly     | Notes                                                                                                               |
| ----------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------- |
| Idle                          | **≈ $1.00** | The KMS key. Everything else is pay-per-request or always-free (alarms ≤10, dashboard ≤3, SSM standard, budgets ≤2) |
| **200 requests/day (target)** | **≈ $1.10** | API Gateway $0.02, DynamoDB ~$0.01, logs/X-Ray/CloudTrail data events ~$0.05                                        |
| 2,000 requests/day            | ≈ $1.80     |                                                                                                                     |
| 20,000 requests/day           | ≈ $7.60     | Moving to an HTTP API would save ~$1.50 at this level                                                               |

**Budget guardrail:** the `HealthTrack-dev-monthly` budget is set at $3, filtered on the `Project=HealthTrack` cost-allocation tag (activated today). It emails at 80% of actual spend and at 100% of forecast.

**Key rotation:** the KMS key rotates every 3 years. Each rotation adds $1/month, up to $3, so yearly rotation would break the budget by year 3; see the comment in `data_stack.py`.

---

## 8. What you need to do

1. **Confirm the two AWS emails** sent to `josuefotseu02@gmail.com` (topics `HealthTrack-Alerts-dev` and `HealthTrack-OperatorAlerts-dev`). Until then, alarms and emergency alerts reach no one. The budget emails need no confirmation.
2. **Enable MFA on the IAM user `JoshuaER`**, and set the account's security alternate contact.
3. **Decide on the two hand-made secrets** `/health-track/prod/fapshi/api-key` and `/health-track/prod/fapshi/webhook-secret`. They are outside IaC and cost $0.80/month.
   - **If they hold real Fapshi credentials:** move them with `python scripts/bootstrap_params.py --env prod --fapshi "apiuser:apikey"`, then delete them.
   - **If not:** delete them.

   I did not touch them.

4. **Fill in the owner names** in RUNBOOK §1a.
5. **Request a higher Lambda concurrency quota.** The whole account is limited to **10 concurrent executions**, shared with your other projects. It is free (Service Quotas → Lambda → Concurrent executions).
6. **Plan a dedicated AWS account** (AWS Organizations) for health data. The current account also hosts music, e-commerce and other projects.
7. **When you are ready:**
   - set Fapshi sandbox credentials (RUNBOOK §4);
   - set the PWA hosting origin in `cdk.json` → `prod`;
   - add CI with GitHub OIDC.

### Frontend follow-ups created by the backend changes

- **Already done for you:** `Frontend/.env` now uses the single API URL and the new Cognito pool and client.
- **Optional:**
  - the `Prescription`/`Referral` types still list ids that the public lookup no longer returns;
  - the household-consultation list issue (SYS-11) is still open in the backend list query.

---

## 9. Deliberate trade-offs

| Decision                                                 | Why                                                                                                                                                                           | Cost of the alternative                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| One function per **domain** (17), not one per route (66) | Fewer cold starts at 200 requests/day, half the CloudFormation resources. Each domain still has its own least-privilege role, and public reads have separate read-only roles. | Per-route roles and functions: ~2× resources, more cold starts |
| No WAF                                                   | Budget (your decision)                                                                                                                                                        | $5+/month                                                      |
| No GuardDuty / Config / Inspector                        | Budget                                                                                                                                                                        | ~$8–10/month together                                          |
| Cognito Essentials, not Plus                             | Budget                                                                                                                                                                        | $0.02/MAU                                                      |
| KMS rotation every 3 years                               | Keeps the key at $1/month                                                                                                                                                     | Yearly rotation reaches $3/month                               |
| Single region, us-east-1                                 | Your decision. p50 latency is 410 ms measured from this workstation; users in Cameroon should expect similar or higher.                                                       | —                                                              |
