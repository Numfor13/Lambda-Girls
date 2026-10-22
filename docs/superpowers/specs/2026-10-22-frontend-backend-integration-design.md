# Frontend-Backend Integration Design

**Date:** 2026-10-22
**Scope:** Tier 1 integration — Profile, Facilities, Triage, Consultations, Payments, Doctor, Push
**Decision:** Backend is the source of truth for triage results. Tier 2 features remain behind feature flags.

---

## 1. CORS Header Fix

### Problem

Every backend API Gateway stack sets `allow_headers` to `["Content-Type", "Authorization"]`. The frontend sends `Accept-Language` on every request (`client.ts:33`). Browsers will reject preflight responses that don't include `Accept-Language`, breaking all API calls.

### Fix

Add `"Accept-Language"` to the `allow_headers` list in every stack's `default_cors_preflight_options`:

**Files:**
- `health_track/profile_stack.py`
- `health_track/facility_stack.py`
- `health_track/triage_stack.py`
- `health_track/consultation_stack.py`
- `health_track/payment_stack.py`
- `health_track/doctor_stack.py`
- `health_track/push_stack.py`

**Change:** In each file's `CorsOptions`, change:
```python
allow_headers=["Content-Type", "Authorization"],
```
to:
```python
allow_headers=["Content-Type", "Authorization", "Accept-Language"],
```

The `push_stack.py` currently has no `allow_headers` in its CORS config — add the full list there too.

---

## 2. Triage Reconciliation

### Problem

The frontend runs a local triage engine (`src/triage-engine/engine.ts`) for offline UX and then POSTs to `POST /triage`. Currently `triageApi` in `endpoints.ts` has no `submit` method — only `list` and `get`. The triage wizard submits results through the offline outbox or directly, but the contract between what the frontend sends and what the backend expects is not wired.

The backend `post_triage.py` expects a raw `SymptomPayload` and runs its own rule engine. The frontend should send the raw payload, not a pre-computed result.

### Fix

**Frontend changes:**

1. **`endpoints.ts`** — Add `triageApi.submit()`:
   ```ts
   submit: (body: SymptomPayload & { on_behalf_member_id?: string | null }) =>
     request<TriageResult>("triage", "/triage", { method: "POST", body }),
   ```

2. **Triage wizard submission flow** — After local evaluation (for instant display), also call `triageApi.submit()` when online. If offline, enqueue the raw `SymptomPayload` in the offline outbox. When the backend response arrives, replace the locally-computed result with the backend's authoritative one.

3. **`mock.ts`** — Add a `POST /triage` mock route that accepts a `SymptomPayload`, runs the local engine against it, stores the result, and returns it. This keeps mock mode working identically to the real backend.

**Backend verification:**

- Confirm `post_triage.py` accepts `{ age_months, is_pregnant, symptoms, vitals, on_behalf_member_id?, queued_at? }` and returns a `TriageResult` with `result_id`.

---

## 3. Push API Wiring

### Problem

The frontend `env.ts` includes `push` in `apiUrls`, and the backend `PushStack` exposes three routes. But `endpoints.ts` has no `pushApi` object and `mock.ts` has no push routes.

### Fix

**`endpoints.ts`** — Add:
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

**`types.ts`** — Add `PushSubscriptionJSON` type (mirrors the browser's `PushSubscription.toJSON()` shape):
```ts
export interface PushSubscriptionJSON {
  endpoint: string
  keys: { p256dh: string; auth: string }
}
```

**`mock.ts`** — Add three mock routes:
- `GET /push/vapid-public-key` — returns a placeholder public key string
- `POST /push/subscribe` — stores subscription in mock DB, returns `{ ok: true }`
- `DELETE /push/subscribe` — removes subscription, returns `{ ok: true }`

Extend `MockDb` with a `push_subscriptions: Record<string, PushSubscriptionJSON>` field.

---

## 4. Frontend `.env` Creation

### Problem

No `Frontend/.env` file exists. The app always falls back to mock API because `env.useMockApi` is true when no URLs are set.

### Fix

Create `Frontend/.env` with the same structure as `.env.example`, but with comments explaining how to fill in values after CDK deploy:

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

Also add `.env` to `Frontend/.gitignore` (keep `.env.example` tracked).

---

## 5. Secrets Cleanup

### Problem

`Backend/.env` contains real AWS credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) and a Fapshi API key. These should never be in a committed file.

### Fix

1. **Replace `Backend/.env`** with placeholder values:
   ```env
   CDK_ENV=dev
   AWS_ACCESS_KEY_ID=
   AWS_SECRET_ACCESS_KEY=
   AWS_DEFAULT_REGION=us-east-1
   FAPSHI_API_KEY=
   FAPSHI_WEBHOOK_SECRET=
   VAPID_PRIVATE_KEY=
   TELCO_SANDBOX_CREDENTIALS=
   ```

2. **Add to `.gitignore`** at project root (or `Backend/.gitignore`):
   ```
   .env
   !.env.example
   ```

3. The existing `Backend/.env` content with real secrets must be treated as compromised — the user should rotate the AWS credentials and Fapshi key outside this integration work.

---

## 6. Sync Endpoint Alignment

### Problem

The offline outbox sends queued triage results via `POST /sync` (`consultApi.sync()`). The `SyncBody.triage_results` type currently expects fields from `TriageResult` (pre-computed urgency, recommendation, etc.). To align with "backend is truth," synced triage payloads should contain the raw `SymptomPayload` so the backend can recompute.

### Fix

**`endpoints.ts`** — Update `SyncBody.triage_results` type:
```ts
triage_results: {
  result_id: string
  symptom_payload: SymptomPayload
  on_behalf_member_id?: string | null
  queued_at: number
}[]
```

**`mock.ts`** — Update the `POST /sync` mock handler to run the local triage engine on each `symptom_payload` before storing the result, mirroring what the real backend does.

**Backend `post_sync.py`** — Verify it processes `symptom_payload` through the rule engine for each triage item rather than storing pre-computed values.

**`offline/outbox.ts`** — When enqueueing a triage result for sync, store the raw `SymptomPayload` plus metadata (`result_id`, `on_behalf_member_id`, `queued_at`), not the computed result.

---

## Files Changed Summary

### Backend (7 files modified, 1 file replaced)
| File | Change |
|---|---|
| `health_track/profile_stack.py` | Add `Accept-Language` to CORS headers |
| `health_track/facility_stack.py` | Add `Accept-Language` to CORS headers |
| `health_track/triage_stack.py` | Add `Accept-Language` to CORS headers |
| `health_track/consultation_stack.py` | Add `Accept-Language` to CORS headers |
| `health_track/payment_stack.py` | Add `Accept-Language` to CORS headers |
| `health_track/doctor_stack.py` | Add `Accept-Language` to CORS headers |
| `health_track/push_stack.py` | Add `Accept-Language` to CORS headers |
| `.env` | Replace secrets with placeholders |

### Frontend (6 files modified, 2 files created)
| File | Change |
|---|---|
| `src/api/endpoints.ts` | Add `triageApi.submit()`, add `pushApi` object |
| `src/api/types.ts` | Add `PushSubscriptionJSON` type |
| `src/api/mock.ts` | Add `POST /triage` route, add push routes, update sync handler |
| `src/features/triage/TriageWizard.tsx` | Wire submission to send payload to backend |
| `src/offline/outbox.ts` | Store raw SymptomPayload for sync, not computed result |
| `.env` | Create with placeholder structure |
| `.gitignore` | Add `.env` exclusion |

### Project root
| File | Change |
|---|---|
| `.gitignore` | Add `*.env` exclusion (keep `.env.example`) |

---

## What's NOT In Scope

- Tier 2 features (SMS/USSD, extended services, anonymous mode, i18n endpoints)
- New UI components or pages
- CDK deployment or AWS provisioning
- Credential rotation (user responsibility)
- Service worker / PWA manifest changes

---

## Execution Method

Subagent-driven development: each phase built by a fresh agent, reviewed before next phase starts, full-branch review at end.
