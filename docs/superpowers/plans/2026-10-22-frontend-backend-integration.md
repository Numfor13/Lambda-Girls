# Frontend-Backend Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the React frontend to the CDK/Lambda backend for all Tier 1 features so API calls, auth, triage, consultations, payments, doctor queue, and push notifications work end-to-end.

**Architecture:** The frontend already has a complete mock API layer (`mock.ts`) that mirrors every backend Lambda handler. Integration means: (1) fix CORS so real calls pass preflight, (2) add missing API client functions (`triageApi.submit`, `pushApi`), (3) make the triage flow send raw payloads so the backend recomputes results (backend-as-truth), (4) align the offline sync body with the same contract, and (5) clean up leaked secrets.

**Tech Stack:** Python 3.12 / AWS CDK (backend), React 18 / TypeScript / Vite (frontend), Dexie.js (offline), oidc-client-ts (auth)

**Spec:** `docs/superpowers/specs/2026-10-22-frontend-backend-integration-design.md`

## Global Constraints

- Python 3.12 runtime for all Lambda functions
- TypeScript strict mode for all frontend code
- No new npm or pip dependencies
- No Tier 2 features — all feature-flagged UI stays behind existing flags
- Backend `.env` must never contain real secrets in version control
- Frontend `.env` must be gitignored

## Review Focus

1. **CORS preflight with `Accept-Language`** — a browser sending `Accept-Language` on a cross-origin request gets a 403 if the preflight response doesn't list it; verify every stack includes it.
2. **Offline triage with no network** — a user runs triage in airplane mode; the result must display immediately from the local engine, be stored in Dexie with the raw `symptom_payload`, and sync correctly when connectivity returns.
3. **Sync body backward compatibility** — the `POST /sync` Lambda currently accepts pre-computed triage fields; after the change it must still handle a payload that has `symptom_payload` but no `urgency` field without crashing.
4. **Mock API parity after changes** — every real backend route in Tier 1 must have a working mock counterpart so development without AWS credentials continues to work.
5. **Push subscription lifecycle in mock** — `pushApi.subscribe()` and `pushApi.unsubscribe()` must round-trip correctly in mock mode (subscribe stores, unsubscribe removes, vapidPublicKey returns a string).

---

### Task 1: Backend — CORS headers, secrets cleanup, rule engine sharing, sync fix

**Files:**
- Modify: `Backend/health_track/profile_stack.py:51` — CORS `allow_headers`
- Modify: `Backend/health_track/facility_stack.py:113` — CORS `allow_headers`
- Modify: `Backend/health_track/triage_stack.py:86` — CORS `allow_headers`
- Modify: `Backend/health_track/consultation_stack.py:184` — CORS `allow_headers`
- Modify: `Backend/health_track/payment_stack.py:127` — CORS `allow_headers`
- Modify: `Backend/health_track/doctor_stack.py:149` — CORS `allow_headers`
- Modify: `Backend/health_track/push_stack.py:97-99` — CORS `allow_headers` (currently missing)
- Modify: `Backend/.env` — replace secrets with placeholders
- Create: `Backend/lambda_layers/common/python/health_track_common/rules/__init__.py`
- Create: `Backend/lambda_layers/common/python/health_track_common/rules/rule_engine.py`
- Create: `Backend/lambda_layers/common/python/health_track_common/rules/child_under_5.py`
- Create: `Backend/lambda_layers/common/python/health_track_common/rules/obstetric.py`
- Create: `Backend/lambda_layers/common/python/health_track_common/rules/adult_red_flags.py`
- Modify: `Backend/health_track/lambdas/triage/post_triage.py:3` — update import
- Modify: `Backend/health_track/lambdas/consultation/post_sync.py` — add rule engine call
- Test: `Backend/tests/test_post_sync_triage_recompute.py`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: All 7 API Gateways accept `Accept-Language` in CORS preflight. `health_track_common.rules.rule_engine.evaluate(payload: dict) -> tuple[str, list[dict], str, str]` available from the common layer. `POST /sync` recomputes triage results from `symptom_payload`.

- [ ] **Step 1: Add `Accept-Language` to CORS in all 7 stacks**

In each of the 6 stacks that have `allow_headers=["Content-Type", "Authorization"]`, append `"Accept-Language"` to the list. In `push_stack.py`, the `CorsOptions` has no `allow_headers` — add `allow_headers=["Content-Type", "Authorization", "Accept-Language"]`.

- [ ] **Step 2: Replace secrets in `Backend/.env`**

Replace the file contents with placeholder values — empty strings for `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `FAPSHI_API_KEY`, `FAPSHI_WEBHOOK_SECRET`, `VAPID_PRIVATE_KEY`, `TELCO_SANDBOX_CREDENTIALS`. Keep `CDK_ENV=dev` and `AWS_DEFAULT_REGION=us-east-1`. Add a comment at top: `# Populate from your AWS credentials and Secrets Manager. Never commit real values.`

- [ ] **Step 3: Copy triage rule files to the common Lambda layer**

Copy these 4 files from `Backend/health_track/lambdas/triage/rules/` to `Backend/lambda_layers/common/python/health_track_common/rules/`:
- `__init__.py` (empty)
- `rule_engine.py`
- `child_under_5.py`
- `obstetric.py`
- `adult_red_flags.py`

Keep the originals in `lambdas/triage/rules/` so existing tests and the triage Lambda continue working without changes to the CDK `Code.from_asset` path.

- [ ] **Step 4: Update `post_triage.py` to import from common layer**

Change line 3:
```python
from rules.rule_engine import evaluate
```
to:
```python
from health_track_common.rules.rule_engine import evaluate
```

- [ ] **Step 5: Write failing test for sync triage recompute**

```python
# Backend/tests/test_post_sync_triage_recompute.py
import json
import pytest
from unittest.mock import patch, MagicMock

def test_sync_recomputes_triage_from_symptom_payload():
    """POST /sync with symptom_payload should run rule engine, not store client urgency."""
    from health_track.lambdas.consultation.post_sync import handler

    event = {
        "requestContext": {"authorizer": {"claims": {"sub": "user-1"}}},
        "body": json.dumps({
            "triage_results": [{
                "result_id": "tr-1",
                "symptom_payload": {
                    "age_months": 3,
                    "is_pregnant": False,
                    "symptoms": ["convulsions"],
                    "vitals": {},
                },
                "queued_at": 1700000000000,
            }],
            "messages": [],
        }),
    }

    put_items = []
    mock_table = MagicMock()
    mock_table.put_item = lambda **kw: put_items.append(kw["Item"])

    with patch("boto3.resource") as mock_ddb:
        mock_ddb.return_value.Table.return_value = mock_table
        result = handler(event, None)

    body = json.loads(result["body"])
    assert body["synced"] is True
    assert len(put_items) == 1
    stored = put_items[0]
    # The rule engine should have computed RED for infant convulsions,
    # NOT stored a missing/default urgency from the client payload
    assert stored["urgency"] == "RED"
    assert len(stored["rules_fired"]) > 0
    assert stored["recommendation"] != ""
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd Backend && python -m pytest tests/test_post_sync_triage_recompute.py -v`
Expected: FAIL — `post_sync.py` currently stores `tr.get("urgency", "GREEN")` without running the rule engine.

- [ ] **Step 7: Update `post_sync.py` to run rule engine on synced triage results**

Add import at top of `post_sync.py`:
```python
from health_track_common.rules.rule_engine import evaluate
```

In the `for tr in triage_results:` loop, replace the block that reads `urgency`, `recommendation`, `facility_type_needed`, `rules_fired` from `tr` with:
```python
symptom_payload = tr.get("symptom_payload", {})
urgency, rules_fired, recommendation, facility_type_needed = evaluate(symptom_payload)
```

Then build the `item` dict using these computed values instead of `tr.get(...)`.

- [ ] **Step 8: Run test to verify it passes**

Run: `cd Backend && python -m pytest tests/test_post_sync_triage_recompute.py -v`
Expected: PASS

- [ ] **Step 9: Run all existing backend tests**

Run: `cd Backend && python -m pytest tests/ -v`
Expected: All tests pass (CORS changes are CDK-level; rule engine import path works from both locations).

- [ ] **Step 10: Commit**

```
git add Backend/health_track/ Backend/lambda_layers/ Backend/.env Backend/tests/test_post_sync_triage_recompute.py
git commit -m "fix(backend): CORS Accept-Language, secrets cleanup, share rule engine for sync recompute"
```

---

### Task 2: Frontend API layer — triage submit, push API, mock routes, env files

**Files:**
- Modify: `Frontend/src/api/types.ts` — add `PushSubscriptionJSON`
- Modify: `Frontend/src/api/endpoints.ts` — add `triageApi.submit`, add `pushApi`
- Modify: `Frontend/src/api/mock.ts` — add `POST /triage` route, add 3 push routes, add `push_subscriptions` to `MockDb`
- Create: `Frontend/.env`
- Modify: `Frontend/.gitignore` — add `.env`
- Test: TypeScript compilation (`npx tsc --noEmit`)

**Interfaces:**
- Consumes: `SymptomPayload` type from `types.ts` (existing), `evaluate` from `triage-engine/engine.ts` (existing)
- Produces:
  - `triageApi.submit(body: SymptomPayload & { on_behalf_member_id?: string | null; queued_at?: number }): Promise<TriageResult>`
  - `pushApi.vapidPublicKey(): Promise<{ public_key: string }>`
  - `pushApi.subscribe(body: { subscription: PushSubscriptionJSON }): Promise<{ ok: boolean }>`
  - `pushApi.unsubscribe(): Promise<{ ok: boolean }>`
  - `PushSubscriptionJSON` type exported from `types.ts`

- [ ] **Step 1: Add `PushSubscriptionJSON` to `types.ts`**

After the `SyncResponse` interface (end of file), add:
```ts
export interface PushSubscriptionJSON {
  endpoint: string
  keys: { p256dh: string; auth: string }
}
```

- [ ] **Step 2: Add `triageApi.submit` to `endpoints.ts`**

In the `triageApi` object, after the `get` method, add:
```ts
submit: (body: SymptomPayload & { on_behalf_member_id?: string | null; queued_at?: number }) =>
  request<TriageResult>("triage", "/triage", { method: "POST", body }),
```

Import `SymptomPayload` in the existing import from `"./types"` (it's already imported via the type list).

- [ ] **Step 3: Add `pushApi` to `endpoints.ts`**

After the `doctorApi` export, add:
```ts
export const pushApi = {
  vapidPublicKey: () =>
    request<{ public_key: string }>("push", "/push/vapid-public-key", { auth: false }),
  subscribe: (body: { subscription: PushSubscriptionJSON }) =>
    request<{ ok: boolean }>("push", "/push/subscribe", { method: "POST", body }),
  unsubscribe: () =>
    request<{ ok: boolean }>("push", "/push/subscribe", { method: "DELETE" }),
}
```

Add `PushSubscriptionJSON` to the import from `"./types"`.

- [ ] **Step 4: Add `POST /triage` mock route to `mock.ts`**

Import `evaluate` from `@/triage-engine/engine` at the top of `mock.ts`. Add a new route entry in the `routes` array before the `GET /triage` routes:
```ts
[
  "POST",
  /^\/triage$/,
  ({ user, data, body }) => {
    const sub = requireUser(user).sub
    const payload = {
      age_months: (body.age_months as number) ?? 999,
      is_pregnant: Boolean(body.is_pregnant),
      symptoms: (body.symptoms as string[]) ?? [],
      vitals: (body.vitals as { resp_rate?: number }) ?? {},
    }
    const result = evaluate(payload)
    const item = {
      result_id: crypto.randomUUID(),
      user_id: sub,
      ...result,
      symptom_payload: payload,
      on_behalf_member_id: (body.on_behalf_member_id as string) ?? null,
      synced_from_offline: Boolean(body.queued_at),
      created_at: (body.queued_at as number) ?? Date.now(),
    }
    data.triage.push(item)
    return item
  },
],
```

- [ ] **Step 5: Add push mock routes and `push_subscriptions` to `MockDb`**

Add `push_subscriptions: Record<string, unknown>` to the `MockDb` interface. Initialize it as `{}` in the `load()` function's default return.

Add three routes to the `routes` array:
```ts
// GET /push/vapid-public-key
["GET", /^\/push\/vapid-public-key$/, () => ({ public_key: "MOCK_VAPID_PUBLIC_KEY_BASE64" })],

// POST /push/subscribe
[
  "POST",
  /^\/push\/subscribe$/,
  ({ user, data, body }) => {
    const sub = requireUser(user).sub
    data.push_subscriptions[sub] = body.subscription
    return { ok: true }
  },
],

// DELETE /push/subscribe
[
  "DELETE",
  /^\/push\/subscribe$/,
  ({ user, data }) => {
    const sub = requireUser(user).sub
    delete data.push_subscriptions[sub]
    return { ok: true }
  },
],
```

- [ ] **Step 6: Create `Frontend/.env`**

```env
# Fill these from CDK outputs after `cdk deploy`.
# Leave empty to use the built-in mock API.
VITE_API_BASE_URL=
VITE_API_URL_PROFILE=
VITE_API_URL_FACILITY=
VITE_API_URL_TRIAGE=
VITE_API_URL_CONSULTATION=
VITE_API_URL_PAYMENT=
VITE_API_URL_DOCTOR=
VITE_API_URL_PUSH=

# Cognito — fill from AuthStack outputs
VITE_COGNITO_AUTHORITY=
VITE_COGNITO_DOMAIN=
VITE_COGNITO_CLIENT_ID=
VITE_COGNITO_REDIRECT_URI=http://localhost:5173/auth/callback

VITE_CONSULTATION_FEE_XAF=2000
VITE_OSM_TILE_URL=
```

- [ ] **Step 7: Add `.env` to `Frontend/.gitignore`**

Append to `Frontend/.gitignore`:
```
# Environment
.env
!.env.example
```

- [ ] **Step 8: Verify TypeScript compiles**

Run: `cd Frontend && npx tsc --noEmit`
Expected: No errors. The new `triageApi.submit` and `pushApi` methods type-check, and the mock routes use the correct types.

- [ ] **Step 9: Commit**

```
git add Frontend/src/api/ Frontend/.env Frontend/.gitignore
git commit -m "feat(frontend): add triageApi.submit, pushApi endpoints, mock routes, env setup"
```

---

### Task 3: Triage wizard submission + sync body alignment

**Files:**
- Modify: `Frontend/src/features/triage/TriageWizard.tsx:133-157` — call `triageApi.submit` when online
- Modify: `Frontend/src/api/endpoints.ts` — update `SyncBody.triage_results` type
- Modify: `Frontend/src/offline/sync.ts:46-73` — send raw payload in sync, update stored result with backend response
- Modify: `Frontend/src/api/mock.ts` — update `POST /sync` handler to run rule engine
- Test: `Frontend/src/triage-engine/engine.test.ts` (existing, verify still passes), manual mock-mode walkthrough

**Interfaces:**
- Consumes: `triageApi.submit()` from Task 2. `evaluate()` from `triage-engine/engine.ts` (existing). `SymptomPayload` type (existing). `LocalTriage` from `offline/db.ts` (existing).
- Produces: Triage wizard stores raw `symptom_payload` and calls backend. Sync sends `symptom_payload` in `SyncBody`. Backend-computed result replaces local result after sync.

- [ ] **Step 1: Update `SyncBody.triage_results` type in `endpoints.ts`**

Replace the existing `SyncBody` interface's `triage_results` field:
```ts
triage_results: {
  result_id: string
  symptom_payload: SymptomPayload
  on_behalf_member_id?: string | null
  queued_at: number
}[]
```

Add `SymptomPayload` to the import from `"./types"` if not already there.

- [ ] **Step 2: Update `TriageWizard.tsx` `finish()` to call backend when online**

In the `finish` function (line 133), after storing the result in Dexie and calling `enqueue("triage", resultId)`, add a direct API call when online:

```ts
if (navigator.onLine) {
  triageApi
    .submit({ ...payload, on_behalf_member_id: a.subject === "member" ? a.memberId : null })
    .then(async (serverResult) => {
      await db.triage_results.update(resultId, {
        urgency: serverResult.urgency,
        recommendation: serverResult.recommendation,
        facility_type_needed: serverResult.facility_type_needed,
        rules_fired: serverResult.rules_fired,
        result_id: serverResult.result_id,
        sync_state: "sent",
      })
      await db.outbox.where("ref").equals(resultId).delete()
    })
    .catch(() => {
      // Falls back to offline sync — outbox item already enqueued
    })
}
```

Import `triageApi` from `@/api/endpoints` at the top of the file.

- [ ] **Step 3: Update `syncTriage` in `sync.ts` to send raw payload**

In the `syncTriage` function (line 45-74), update the loop that builds `body.triage_results` to send only the raw payload fields matching the new `SyncBody` type:

```ts
body.triage_results.push({
  result_id: r.result_id,
  symptom_payload: r.symptom_payload,
  on_behalf_member_id: r.on_behalf_member_id,
  queued_at: r.created_at,
})
```

Remove the lines that push `urgency`, `recommendation`, `facility_type_needed`, `rules_fired`.

- [ ] **Step 4: Update `POST /sync` mock handler to run rule engine**

In `mock.ts`, find the `POST /sync` route handler. In the `for (const tr of body.triage_results)` loop, replace the direct field reads with a call to the local engine:

```ts
const payload = (tr as { symptom_payload?: SymptomPayload }).symptom_payload ?? {
  age_months: 999, is_pregnant: false, symptoms: [], vitals: {},
}
const result = evaluate(payload)
data.triage.push({
  result_id: tr.result_id ?? crypto.randomUUID(),
  user_id: sub,
  ...result,
  symptom_payload: payload,
  on_behalf_member_id: (tr as Record<string, unknown>).on_behalf_member_id as string | null ?? null,
  synced_from_offline: true,
  created_at: (tr as Record<string, unknown>).queued_at as number ?? Date.now(),
})
```

Import `evaluate` at the top if not already done in Task 2.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd Frontend && npx tsc --noEmit`
Expected: No errors. The `SyncBody` type change is compatible with the updated `syncTriage` and mock handler.

- [ ] **Step 6: Run existing triage engine tests**

Run: `cd Frontend && npx vitest run src/triage-engine/engine.test.ts`
Expected: All pass — the engine itself is unchanged.

- [ ] **Step 7: Start dev server and walk through triage flow in mock mode**

Run: `cd Frontend && npm run dev`

Manual verification:
1. Open app, sign in as demo patient
2. Start triage wizard → select "Me" → enter age/sex → select symptoms → finish
3. Result page shows urgency badge and recommendation
4. Open browser DevTools → Application → Local Storage → verify `cb_mock_db` has the triage result with `symptom_payload` stored
5. The result should have been computed by the mock's rule engine (matching the local engine output)

- [ ] **Step 8: Commit**

```
git add Frontend/src/api/endpoints.ts Frontend/src/features/triage/TriageWizard.tsx Frontend/src/offline/sync.ts Frontend/src/api/mock.ts
git commit -m "feat(frontend): triage sends raw payload to backend, sync aligned with backend-as-truth"
```

---

## Self-Review Checklist

**Spec coverage:**
- Section 1 (CORS): Task 1, Steps 1 — all 7 stacks covered
- Section 2 (Triage reconciliation): Task 2 Step 2+4, Task 3 Steps 1-4
- Section 3 (Push API): Task 2 Steps 1+3+5
- Section 4 (Frontend .env): Task 2 Steps 6+7
- Section 5 (Secrets cleanup): Task 1 Step 2
- Section 6 (Sync alignment): Task 1 Steps 5-8, Task 3 Steps 1+3+4

**Step scan:** Each step produces one checkable change. No placeholders or vague instructions.

**Type consistency:** `triageApi.submit()` signature matches across Task 2 Step 2 (definition) and Task 3 Step 2 (usage). `SyncBody.triage_results` type in Task 3 Step 1 matches what `syncTriage` sends in Step 3. `evaluate` import used consistently in mock.ts across Tasks 2 and 3. `PushSubscriptionJSON` defined in Task 2 Step 1, used in Task 2 Step 3.

**Review Focus tests added:** Items 2 (offline triage) and 3 (sync backward compat) are tested by Task 1 Steps 5-8 and Task 3 Steps 5-7. Items 1 (CORS), 4 (mock parity), and 5 (push lifecycle) are verified by Task 1 Step 9, Task 2 Step 8, and Task 3 Step 7.

**Proportion:** Plan is focused — signatures, assertions, and one-line approach notes. No function bodies transcribed.
