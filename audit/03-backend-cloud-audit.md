# CareBridge: Backend and Cloud Audit

|                    |                                                                                                                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scope**          | AWS CDK app (`Backend/app.py`, `Backend/health_track/*_stack.py`), Lambda packaging and runtime configuration, plus the **live** AWS account                                                                   |
| **Account/region** | `019141478309` / `us-east-1`, environment `dev`. All 14 stacks are `CREATE_COMPLETE`, deployed 22 Oct 2026, 02:41–03:17 UTC.                                                                                   |
| **Method**         | IaC read in full and synthesized locally. The live account was inspected with **read-only** AWS CLI calls (describe/list/get only; no secret values read). Public endpoints were probed with GET/OPTIONS only. |
| **Companion docs** | Application-code defects (SYS-xx) are in [01-system-audit.md](01-system-audit.md). Product fit is in [02-solution-assessment.md](02-solution-assessment.md).                                                   |

---

## 1. Executive summary

**The backend is deployed, but it has never been used.** All 19 DynamoDB tables hold **0 items**, the Cognito pool has **0 users**, the facility API returns `[]`, and the translations bucket is empty. Nobody has completed a real request against it. The deployed code is also older than the repo: commit `bf35f9c`, which carries the CORS and secrets fixes, was never deployed.

The infrastructure is a reasonable serverless shape: Lambda, on-demand DynamoDB with point-in-time recovery, S3 and Cognito. It has **structural problems that will hurt on the next deploy**, and it is **not fit to hold health data**.

| Severity    | Count |
| ----------- | ----- |
| 🔴 Critical | 5     |
| 🟠 High     | 9     |
| 🟡 Medium   | 13    |
| 🟢 Low      | 9     |

**Top five:**

1. **CLD-01:** the payment webhook is public and unverified in the only deployed environment, and its lookup is broken. Payments are both forgeable and losable.
2. **CLD-02:** the shared-layer "export lock" fix didn't work. The next change to `lambda_layers/` will fail `cdk deploy --all`.
3. **CLD-03:** health data is logged in full (API Gateway data trace) to log groups that **never expire**.
4. **CLD-04:** the deploy region is inconsistent. The Makefile bootstraps `af-south-1`, which is **not even enabled** on this account. `cdk.json` deploys to `us-east-1`. A clean `make bootstrap && make deploy-dev` fails.
5. **CLD-05:** **about $36.50 a month of the roughly $38 idle bill is a NAT gateway that nothing uses.** A "Zero-Spend Budget" exists on the account, so alerts are presumably already firing.

---

## 2. Live inventory

| Resource          | Live state                                                                                                                       | Comment                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| CloudFormation    | 14 `HealthTrack-*-dev` stacks                                                                                                    | Plus 51 exports (many never imported)                                                    |
| API Gateway       | **11 separate REST APIs**, each with its own base URL                                                                            | The frontend is configured for 7. There is no custom domain and no single entry point.   |
| Lambda            | 66 app functions (python3.12) plus 3 CDK custom-resource functions                                                               | **None in the VPC**                                                                      |
| DynamoDB          | 19 tables, on-demand, PITR on, AWS-owned encryption key                                                                          | **All 0 items.** Deletion protection is off on all of them.                              |
| S3                | voice-notes, i18n (empty), deploy bucket (unused)                                                                                | Voice-notes CORS allows origin `*`                                                       |
| Cognito           | `us-east-1_z6a3hAAPP`: 0 users; 0 in Patient, Doctor, Operator and Admin                                                         | MFA OFF, deletion protection INACTIVE, callback **localhost only**, SNS SMS role present |
| Secrets Manager   | 4 dev secrets, **unchanged since creation** (random CDK-generated values); 2 `prod` secrets created by hand, with no prod stacks | Fapshi key is a random string, not `apiuser:apikey`                                      |
| VPC               | 1 VPC, **1 NAT gateway + 1 Elastic IP (3.232.41.248)** running                                                                   | Serves no workload                                                                       |
| SNS               | `HealthTrack-OperatorAlerts-dev`                                                                                                 | **No subscriptions**                                                                     |
| EventBridge       | 2 rules (`payment.confirmed`, `message.sent`)                                                                                    | **No producer** anywhere in the code                                                     |
| CloudTrail        | **No trail**                                                                                                                     |                                                                                          |
| WAF               | **None**                                                                                                                         |                                                                                          |
| CloudWatch alarms | **None** for HealthTrack                                                                                                         | Alarms exist only for an unrelated project                                               |
| Frontend hosting  | **None** (no S3/CloudFront/Amplify for the PWA)                                                                                  | The only CloudFront distribution belongs to another project                              |

### Live endpoint probes (read-only)

| Probe                                                | Result                                              | Meaning                                                                            |
| ---------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `GET facility/dev/facilities`                        | `200 {"facilities": [], "next_key": null}`          | Never seeded                                                                       |
| `GET i18n/dev/i18n/en`                               | `404 {"error": "Translations not found"}`           | Bucket empty                                                                       |
| `GET push/dev/push/vapid-public-key`                 | `200 {"vapid_public_key": "TO_BE_SET_POST_DEPLOY"}` | Placeholder served as if it were a real key                                        |
| `GET extended/dev/health-tips`                       | `200 {"tips": [], "count": 0}`                      | No content                                                                         |
| `GET doctor/dev/doctor/queue` (no token)             | `401`, **no `Access-Control-Allow-Origin`**         | The browser will see a "network error"                                             |
| `OPTIONS consultation/dev/consultations`             | `Allow-Headers: Content-Type,Authorization`         | The deployed version predates the Accept-Language fix, which confirms deploy drift |
| Cognito `/oauth2/authorize` with the PWA's scopes    | `invalid_scope`                                     | Sign-in is broken (SYS-01)                                                         |
| `aws cloudformation list-stacks --region af-south-1` | `InvalidClientTokenId`                              | Region not enabled on the account                                                  |

### Account hygiene

- The account is **shared with at least five unrelated projects**: music, `clean-am`, an e-commerce stack, a CDK tutorial and an Amplify Todo app, with their tables, user pools and APIs side by side. Health data should live in its own account. A wildcard such as `table/HealthTrack-*` only stays safe while nobody else creates a similarly named table.
- Deployments are made by the IAM **user** `JoshuaER` with long-lived access keys. There is no role-based CI deploy.

---

## 3. Architecture

### 3.1 Topology

- There are 14 stacks: Shared, Secrets, Auth, Profile, Facility, Triage, Consultation, Payment, Doctor, Push, Channel, Extended, Anonymous and I18n. Each feature stack creates its **own RestApi**. Paths also overlap across APIs: `/consultations/{id}/…` exists on both the Consultation and Doctor APIs, `/doctor/…` on Doctor and Extended, and `/operator/…` on Channel and Extended.
- **Consequences:**
  - The client must know 11 base URLs; the `.env.example` comment saying "one base URL covers every service" is wrong.
  - Every API needs its own throttling, CORS and gateway-response setup, and none has them.
  - A custom domain later requires base-path mappings for all 11.
- **Recommendation:** one RestApi (or HTTP API) in one "Api" stack, with feature stacks contributing routes, or one domain with base-path mappings. Fewer stacks also means fewer cross-stack exports (CLD-02).

### 3.2 Cross-stack coupling by string

Stacks reference other stacks' tables by **hard-coded names** (`HealthTrack-Profiles-{env}`, `-TriageResults-`, `-Consultations-`, `-Payments-` …), for example in `consultation_stack.py:100`, `payment_stack.py:54`, `doctor_stack.py:56-58`, `anonymous_stack.py:54-56` and `auth_stack.py:94,102`.

- CDK can't see these dependencies, so deploy and destroy order isn't enforced. Live timestamps show the Anonymous stack deployed before the Consultation and Payment tables it reads.
- **Fix:** pass `Table` objects between stacks, or merge the stacks.

### 3.3 Packaging

- Each function uses `Code.from_asset(<its folder>)`, plus the `CommonLayer` (`health_track_common`). Sibling imports resolve correctly.
- **The one runtime import failure is `pywebpush`** in `push/post_send.py:13`. No requirements are bundled anywhere, so the import fails, the error is re-raised, and every push send returns 500.
- `Backend/health_track/lambdas/triage/rules/` is a dead, byte-identical copy of the layer's rules. Delete it.

---

## 4. Findings

### 🔴 Critical

**CLD-01 Payment webhook: public, unverified in the deployed environment, and lookup broken**

- `POST /payments/webhook` is `AuthorizationType.NONE` ([payment_stack.py:156](../Backend/health_track/payment_stack.py#L156)) with no throttling.
- The handler skips verification when `ENV_NAME == "dev"` ([post_webhook.py:30-35](../Backend/health_track/lambdas/payment/post_webhook.py#L30)), and dev is the only deployed environment.
- The lookup is `scan(Filter, Limit=1)` ([post_webhook.py:50-58](../Backend/health_track/lambdas/payment/post_webhook.py#L50)). It reads one item and then filters, so it misses as soon as the table has two rows, and returns 200, so Fapshi never retries.
- The `Payments` table has an unused `ConsultationIndex` and **no** index on `fapshi_ref`.
- **Fix:**
  - Look up by `payment_id` (sent to Fapshi as `externalId`).
  - Confirm status with Fapshi's API before trusting the body.
  - Make the consultation update conditional on `pending_payment` and atomic with the payment update (`TransactWriteItems`).
  - Throttle the route.
  - See SYS-02, SYS-03, SYS-06 and SYS-18.

**CLD-02 The shared-layer export lock is still in place, so the next layer change breaks deploy**

- `LayerVersion.from_layer_version_arn(shared_stack.common_layer.layer_version_arn)` (e.g. [auth_stack.py:80-84](../Backend/health_track/auth_stack.py#L80)) still passes a cross-stack token. Synth shows **12 stacks importing** `HealthTrack-Shared-dev:ExportsOutputRefCommonLayer…`, which the comment says was meant to be avoided.
- **Impact:** any edit under `lambda_layers/` creates a new layer version ARN. CloudFormation refuses to change an export while it is imported, so the Shared stack update fails and the whole deploy is blocked.
- **Fix:**
  - Simplest: drop the layer and bundle `health_track_common` into each function asset.
  - Alternative: write the ARN to SSM Parameter Store and read it with `StringParameter.value_for_string_parameter`.

**CLD-03 Health data logged in full, forever**

- `data_trace_enabled=True` on 10 of 11 stages in dev (for example [consultation_stack.py:191](../Backend/health_track/consultation_stack.py#L191), [channel_stack.py:137](../Backend/health_track/channel_stack.py#L137)). This writes full request and response bodies to `API-Gateway-Execution-Logs_*`: symptoms, complaints, chat messages, phone numbers and payment payloads.
- These groups and every Lambda log group have **no retention**, so they never expire.
- `post_sms.py:61` additionally logs phone number plus reply text, and the webhook stores the payer's phone in `receipt_data`.
- The `/health-track/dev/api` log group in `shared_stack.py:54-58` is wired to no stage.
- **Fix:** disable data trace everywhere, set `log_retention` on all functions (14–30 days), enable structured **access** logs without bodies, and scrub PII from logs.

**CLD-04 Region configuration is inconsistent, and the Makefile targets a disabled region**

| Source                                              | Region       |
| --------------------------------------------------- | ------------ |
| `Makefile:10` (`bootstrap`)                         | `af-south-1` |
| `cdk.json` context (dev, staging, prod)             | `us-east-1`  |
| `Backend/.env.example`                              | `af-south-1` |
| `tests/conftest.py`                                 | `af-south-1` |
| `scripts/seed_facilities.py:698`, `seed_i18n.py:65` | `af-south-1` |
| `cdk.context.json` cache, live deployment           | `us-east-1`  |

- `af-south-1` is an opt-in region and is **not enabled** on this account (the CLI returns `InvalidClientTokenId`).
- **Impact:** a clean `make bootstrap && make deploy-dev` fails. The seed scripts write to the wrong region. The tests synthesize a different region from the one that runs.
- **Fix:** choose one region (§7) and make it the single source, `config.region`, used everywhere.

**CLD-05 $36.50/month spent on a NAT gateway that serves nothing**

- [shared_stack.py:21-36](../Backend/health_track/shared_stack.py#L21) creates a VPC with `nat_gateways=1`. **No Lambda is attached to any VPC** (verified live).
- A NAT gateway costs $0.045/h, plus $0.005/h for the public IPv4 address. That is 96% of the idle bill, for a brief that asks for _affordable_.
- **Fix:** delete the VPC from `SharedStack`. If a VPC is ever needed, use VPC endpoints for DynamoDB and S3 (free gateway endpoints) instead of NAT.

### 🟠 High

| ID     | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Evidence                                                                                                                                           | Fix                                                                                                                                                                                                        |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLD-06 | **Push is not deployable as written.** The public key env is the literal `TO_BE_SET_POST_DEPLOY` (served live). The private key env is `""`. `VAPID_SECRET_ARN` is granted but never read. `pywebpush` is not bundled. No code calls `events.put_events`, so the two EventBridge rules never fire. `post_send` swallows errors, so EventBridge never retries.                                                                                                                                                                                                          | [push_stack.py:45-46,81](../Backend/health_track/push_stack.py#L45), [post_send.py:13,53](../Backend/health_track/lambdas/push/post_send.py#L13)   | Generate VAPID keys; put the public key in config and the private key in Secrets Manager or SSM and read it at runtime; bundle the dependency; emit events from the webhook and `post_message`; add a DLQ. |
| CLD-07 | **Secrets hold random values and nothing documents how to fill them.** All 4 were created with `GenerateSecretString` and never updated (live `LastChangedDate` equals creation time). `fapshi.py` splits the key as `apiuser:apikey`, so live Fapshi would fail. The telco secret is read by nothing. Two `prod` secrets were created by hand outside IaC.                                                                                                                                                                                                            | `secrets_stack.py`, live `list-secrets`                                                                                                            | Add a runbook (`aws secretsmanager put-secret-value …`), or use SSM SecureString (free). Delete unused secrets; bring the prod ones into IaC or remove them.                                               |
| CLD-08 | **No hosting for the PWA, and Cognito allows only localhost.** Callback and logout URLs are `http://localhost:5173/…`. There is no S3+CloudFront or Amplify Hosting, and no CI/CD (`.github/` absent).                                                                                                                                                                                                                                                                                                                                                                 | [auth_stack.py:57-58](../Backend/health_track/auth_stack.py#L57)                                                                                   | Add a hosting stack (S3 + CloudFront with OAC, SPA fallback, security headers/CSP) and per-environment callback URLs.                                                                                      |
| CLD-09 | **Public, unsigned, unthrottled endpoints that write data.** `/channels/sms` and `/channels/ussd` (anyone can enqueue nurse callbacks for any number), and `/payments/webhook`. Public lookups `/prescriptions/{code}` and `/referrals/{code}` return the full record (patient_id, doctor_id, medication). Only the Anonymous API has stage throttling. There is no WAF and no usage plans.                                                                                                                                                                            | [channel_stack.py:152,160](../Backend/health_track/channel_stack.py#L152), [doctor_stack.py:204,211](../Backend/health_track/doctor_stack.py#L204) | Stage throttling on every API; a gateway shared secret or IP allowlist on telco webhooks; a projection on public lookups; AWS WAF with rate-based rules on the public routes.                              |
| CLD-10 | **No CORS on gateway error responses.** None of the 11 APIs defines `GatewayResponse`s. Authorizer 401/403 and throttle 429 responses reach the browser without CORS (verified live), so the PWA reads them as "offline".                                                                                                                                                                                                                                                                                                                                              | All `*_stack.py`                                                                                                                                   | Add `DEFAULT_4XX`/`DEFAULT_5XX` responses with CORS headers on every API.                                                                                                                                  |
| CLD-11 | **Cognito isn't ready for health data or for Cameroon.** No MFA, even for Doctor and Admin. No deletion protection. Weak password policy (8 characters, no symbols or upper case). The default Cognito email sender is limited to about 50 emails/day. **Phone auto-verify uses SNS in sandbox mode**: only verified numbers, and a $1/month default SMS spend limit, so Cameroonian phone verification will fail. `pre_signup` auto-confirms every sign-up in dev, the live environment. Doctor, Operator and Admin can be assigned only by an engineer with the CLI. | [auth_stack.py:23-41](../Backend/health_track/auth_stack.py#L23), `pre_signup.py:5-7`                                                              | Required TOTP MFA for staff groups; SES for email; SNS production access and a spend limit for SMS; deletion protection in prod; an Admin-only, audited doctor-onboarding flow.                            |
| CLD-12 | **Destroy, then redeploy, fails.** The Profiles table uses `RemovalPolicy.RETAIN` in **every** environment with a fixed `table_name`. After `make destroy-dev` the table survives and the next deploy fails with "already exists".                                                                                                                                                                                                                                                                                                                                     | [profile_stack.py:26](../Backend/health_track/profile_stack.py#L26)                                                                                | Use the same pattern as the other stacks: RETAIN in prod only.                                                                                                                                             |
| CLD-13 | **Health tables can be destroyed in the live environment.** Dev, which is the only deployed environment, uses `DeletionPolicy: Delete` on every health table except Profiles, and deletion protection is off on all of them. `make destroy-dev` uses `--force`.                                                                                                                                                                                                                                                                                                        | Stacks, live `describe-table`                                                                                                                      | Fine for throwaway dev. Do not put real patients in dev, and enable deletion protection in staging and prod.                                                                                               |
| CLD-14 | **Deploy drift.** Lambdas last modified 02:50–03:18 UTC. Later backend commits (`bf35f9c` at 06:28 UTC) are not deployed. There is no pipeline, so what runs is whatever someone last deployed by hand.                                                                                                                                                                                                                                                                                                                                                                | Live `list-functions`, `git log`                                                                                                                   | CI deploy from `main` with `cdk diff` in PRs.                                                                                                                                                              |

### 🟡 Medium

| ID     | Finding                                                                                                                                                                                                                                                                                                                                                                                  | Evidence                                                                 |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| CLD-15 | **Over-broad IAM.** Managed policies grant `dynamodb:*Item`/`Scan` on `table/HealthTrack-*`, which covers all tables in all environments. Triage, Consultation and Payment functions get read **and write** on every table. `doctor_stack.py:128-137` does the same. The S3 managed policies match `health-track-{acct}-*`, which doesn't match the real bucket names, so they are dead. | [shared_stack.py:61-90](../Backend/health_track/shared_stack.py#L61)     |
| CLD-16 | **Voice-notes bucket is weaker than the plan.** No `enforce_ssl` (the i18n bucket has it), no versioning (required by the plan's Phase 10), CORS `AllowedOrigins: *`, and no expiry. The 90-day move to Standard-IA likely **raises** cost, because IA bills a 128 KB minimum per object and Opus notes are about 80 KB.                                                                 | `consultation_stack.py:70-86`, live `get-bucket-lifecycle-configuration` |
| CLD-17 | **Lambda timeouts don't fit API Gateway.** Doctor, Push, Channel, Extended and Anonymous functions use 30 s, above API Gateway's 29 s integration limit, so the client gets a 504 while the function keeps running. Auth triggers and Profile functions use the default 3 s, while `post_confirmation` uses 5 s boto timeouts inside its 3 s budget.                                     | Live `list-functions`                                                    |
| CLD-18 | **Emergency alerts go nowhere.** The `OperatorAlerts` SNS topic has **no subscribers**. The Emergencies table TTL is 24 h, so the emergency audit trail deletes itself.                                                                                                                                                                                                                  | `extended_stack.py:70-84`                                                |
| CLD-19 | **Triage table key design.** PK `result_id` + SK `user_id`, and reads are `Query(result_id, Limit=1)`, so a client-chosen colliding `result_id` can shadow another user's result.                                                                                                                                                                                                        | `triage_stack.py:23-24` (SYS-40)                                         |
| CLD-20 | **One API Gateway CloudWatch role per API.** `cloud_watch_role=True` on all 11 APIs creates 11 `AWS::ApiGateway::Account` resources (a regional singleton) and 11 retained IAM roles. Each deploy re-points the account setting, and destroy leaves orphans.                                                                                                                             | All API stacks                                                           |
| CLD-21 | **No observability.** No alarms, dashboards or X-Ray. No API access logs (`AccessLogSetting` is empty on all 11 stages). The plan's Phase 10 calls for all of these. Nobody would know the webhook was failing.                                                                                                                                                                          | Live `describe-alarms`                                                   |
| CLD-22 | **No audit trail.** No CloudTrail trail exists in the account, so there is no record of who read or changed health-data resources or IAM.                                                                                                                                                                                                                                                | Live `describe-trails`                                                   |
| CLD-23 | **Environments aren't separated.** Staging and prod differ from dev only in name suffix and RETAIN policy. They share the same account (whatever CLI credentials are active), the same region and no pipeline.                                                                                                                                                                           | `config.py`, `cdk.json`                                                  |
| CLD-24 | **Fapshi base URL is hard-coded to production** (`https://live.fapshi.com`), so any non-dev environment charges real money and there is no sandbox stage.                                                                                                                                                                                                                                | `health_track_common/fapshi.py:8`                                        |
| CLD-25 | **No dead-letter queues or retry policy** on the asynchronous EventBridge → Lambda path.                                                                                                                                                                                                                                                                                                 | `push_stack.py:146-162`                                                  |
| CLD-26 | **Local CDK CLI too old.** Synth warns "Cloud assembly schema 55 > CLI max 54; need CLI ≥ 2.1146.1". `requirements.txt` pins `aws-cdk-lib>=2.150.0` with no upper bound, so library and CLI drift independently.                                                                                                                                                                         | Local `cdk synth`                                                        |
| CLD-27 | **Shared account with unrelated projects** (see §2), and deploys use long-lived IAM user keys.                                                                                                                                                                                                                                                                                           | Live account                                                             |

### 🟢 Low

| ID     | Finding                                                                                                                                                                                      |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLD-28 | Deploy bucket in `SharedStack` (versioned, RETAIN) is unused; CDK uses its bootstrap bucket.                                                                                                 |
| CLD-29 | 51 named CloudFormation exports, most never imported. Each one is a future lock risk.                                                                                                        |
| CLD-30 | If `CDK_DEFAULT_ACCOUNT` is empty, the hand-built ARNs (`doctor_stack.py:136`, `anonymous_stack.py:52`, `extended_stack.py:91`) get an empty account field.                                  |
| CLD-31 | Deprecated APIs: `point_in_time_recovery` and `add_dependency` (synth warnings).                                                                                                             |
| CLD-32 | CORS is `ALL_ORIGINS` on every API, plus a hard-coded `Access-Control-Allow-Origin: *` in `response.py`. Acceptable with bearer tokens; restrict it in prod.                                 |
| CLD-33 | `cdk.context.json` commits the account id, and `Frontend/.env` commits the API URLs, pool id and client id. Not secrets, but they map the attack surface for anyone with repo access.        |
| CLD-34 | `jwt_util.decode_claims` (unverified JWT decode) ships in the layer, unused.                                                                                                                 |
| CLD-35 | `Payments.ConsultationIndex` GSI is unused, and costs write capacity on every payment write.                                                                                                 |
| CLD-36 | Stack tests assert key schemas and auth types, but not encryption, log retention, NAT, cross-stack exports or a whole-app synth. They also synthesize `af-south-1`, not the deployed region. |

---

## 5. Cost (idle, us-east-1, no traffic)

| Item                                                                | $/month                                                                                 |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| NAT gateway (730 h × $0.045)                                        | **32.85**                                                                               |
| Public IPv4 for NAT EIP (730 h × $0.005)                            | **3.65**                                                                                |
| Secrets Manager (4 × $0.40)                                         | 1.60                                                                                    |
| DynamoDB on-demand, 19 tables, near-empty, PITR                     | ≈ 0                                                                                     |
| API Gateway (11 REST APIs), Lambda (69 functions), EventBridge, SNS | 0 at idle                                                                               |
| S3 (3 buckets, mostly empty)                                        | ≈ 0.01                                                                                  |
| Cognito (under 10k MAU)                                             | 0, plus per-message SMS cost                                                            |
| CloudWatch Logs                                                     | 0 at idle; **$0.50/GB ingest + $0.03/GB-month forever** once data-trace traffic arrives |
| **Total**                                                           | **≈ $38.10**                                                                            |

**After the fixes** (delete the VPC, move secrets to SSM SecureString, set log retention, turn off data trace), idle cost is **about $0**. Per-request cost then dominates and stays low. As a rough estimate, 10,000 consultations/month at about 20 API calls each comes to about $1 of API Gateway REST plus about $0.50 of Lambda and DynamoDB. Moving to HTTP API would cut the API Gateway line by about 70%.

---

## 6. Security and compliance for health data

| Control                     | State                                                                                                | Gap                                                                                                                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Encryption at rest          | DynamoDB: AWS-owned key. S3: SSE-S3.                                                                 | No customer-managed KMS key, so there's no key-usage audit trail and no crypto-shredding. Use a CMK for the Consultations, Messages, TriageResults, Profiles and voice-notes resources.                         |
| Encryption in transit       | API Gateway TLS. i18n bucket enforces SSL.                                                           | Voice-notes bucket doesn't enforce SSL (CLD-16).                                                                                                                                                                |
| Authentication              | Cognito ID token checked by API Gateway authorizers; groups read from verified claims (correct).     | No MFA for staff; sign-in broken (SYS-01).                                                                                                                                                                      |
| Authorization               | Group checks in handlers.                                                                            | Missing **ownership** checks on messages, sync, voice notes, consultations and doctor actions (SYS-05, SYS-07, SYS-10, SYS-20).                                                                                 |
| Audit logging               | None.                                                                                                | No CloudTrail, no data events, no application audit log of who viewed which record.                                                                                                                             |
| Logging hygiene             | Full bodies logged, kept forever (CLD-03).                                                           |                                                                                                                                                                                                                 |
| Data retention and deletion | None defined. No account-deletion path. Emergencies expire after 24 h, which is the wrong way round. | Define retention per data class and add a "delete my data" flow.                                                                                                                                                |
| Consent                     | UI checkbox stored in `localStorage` only.                                                           | Store consent server-side with a timestamp and a policy version.                                                                                                                                                |
| Data residency              | US (`us-east-1`).                                                                                    | Cameroon's 2024 personal data protection law (Law No. 2024/017) regulates cross-border transfer and sensitive data, including health data. Get legal review before real patient data lands outside the country. |
| Account isolation           | Shared with five-plus unrelated projects (CLD-27).                                                   | Dedicated AWS account (Organizations) per environment for health data.                                                                                                                                          |

---

## 7. Region recommendation

- `us-east-1` adds roughly 200–300 ms of round-trip latency from Cameroon and places the data in the US.
- `af-south-1` (Cape Town) is the nearest AWS region on paper, but it is opt-in (not enabled here), costs about 20–30% more, and Central African traffic often routes through Europe anyway.
- **`eu-west-3` (Paris) or `eu-south-1` (Milan)** frequently give the lowest real latency from Cameroonian carriers and keep data in a GDPR jurisdiction. **Measure from Buea on MTN and Orange before deciding**, then set it once in `config.py` and remove every other region literal (CLD-04).

---

## 8. Remediation plan

### Immediate (before the next deploy)

1. Delete the VPC and NAT gateway (CLD-05).
2. Fix the layer export lock: bundle the layer code or use SSM (CLD-02).
3. Choose one region and remove all other region literals (CLD-04).
4. Turn off data trace and set log retention everywhere (CLD-03).
5. Fix the webhook: primary-key lookup, verification against Fapshi, conditional transactional update, throttling (CLD-01).
6. Add the `PHONE` scope or drop it on the client; add per-environment callback URLs (SYS-01, CLD-08).
7. Add gateway responses with CORS on every API (CLD-10).
8. Fix the seed scripts and seed facilities and i18n (SYS-04).
9. Redeploy from `main` to close the drift (CLD-14).

### Short term (1–2 weeks)

1. Consolidate to **one API** behind one custom domain; pass tables by reference instead of name strings (§3.1, §3.2).
2. CI/CD with GitHub OIDC → a deploy role (no long-lived keys); `cdk diff` on PRs; post-deploy smoke test that signs in and completes a paid consultation.
3. PWA hosting on S3 + CloudFront with a CSP.
4. Push end to end (CLD-06). Secrets runbook or SSM migration (CLD-07).
5. Throttling on all stages; WAF on public routes; signed telco webhooks (CLD-09).
6. Alarms on Lambda errors, API 5xx and webhook failures; an SNS subscription for operator alerts (CLD-18, CLD-21).
7. Least-privilege IAM per function using `table.grant_*` (CLD-15).

### Before any real patient data

1. A dedicated AWS account per environment and a CloudTrail trail with data events (CLD-22, CLD-27).
2. Customer-managed KMS keys on all health-data tables and the voice-notes bucket.
3. MFA for staff groups; SES email; SNS SMS production access (CLD-11).
4. Retention and deletion policies, server-side consent records, and legal review of data residency (§6).
5. Deletion protection and RETAIN on prod tables; a tested restore from PITR.
