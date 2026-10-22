# AGENTS.md: handoff for Codex (and any other coding agent)

> Codex reads this file automatically. It was written on 2026-10-22 by Claude Code so work can continue if Claude credits run out. Keep it current: when you finish a chunk of work, update **§6 Status log**.

## 1. Project in one paragraph

**CareBridge** (internal name **Health Track**) is an offline-first health access PWA for Buea, Cameroon. Patients find facilities, run a danger-sign triage (RED/AMBER/GREEN), consult a doctor asynchronously by text or voice (also on behalf of a household member), and pay per consultation with Fapshi mobile money. Doctors work a RED-first queue and issue prescription and referral codes. Tier 2 adds operator/admin consoles, SMS/USSD, appointments, lab tests, blood requests, emergency location share, health tips, anonymous mode and EN/FR/Pidgin.

## 2. Current goal: frontend redesign

We are **redesigning the frontend** (`Frontend/`) on top of the existing backend. Ground truth for what the backend can do (every endpoint, request and response shape, role, known gap, and a proposed screen map) is in:

👉 **`docs/BACKEND_FEATURE_MAP.md`**: read it before touching any API code.

Other context (older and partly aspirational; the code wins over all of these):
- `Backend/BACKEND_PHASES.md`: original backend plan
- `Frontend/FRONTEND_PHASES.md`: original frontend plan
- `SOFTWARE_AUDIT.md`: risks (clinical safety, security, privacy)
- `docs/superpowers/specs/2026-10-22-frontend-backend-integration-design.md`: last integration pass

## 3. Git workflow (required)

- **All redesign work goes on the branch `feat/frontend-redesign`.** Never commit straight to `main`.
- Pull before you start: `git checkout feat/frontend-redesign && git pull`.
- Small, focused commits with conventional messages (`feat(frontend): ...`, `fix(frontend): ...`, `docs: ...`). Push after each meaningful step so the other agent can pick up.
- Never commit secrets. `Frontend/.env` is tracked and must contain **placeholders only**; put real values in `Frontend/.env.local` (gitignored). `Backend/.env` must never be committed.
- Do not rewrite history on the shared branch (no force-push).

## 4. Repo layout

```
Backend/                      AWS CDK (Python) + Lambda handlers
  app.py                      wires 14 stacks: HealthTrack-<Name>-<env>
  health_track/*_stack.py     one stack per domain; each creates its own API Gateway
  health_track/lambdas/<domain>/*.py   one handler per route
  lambda_layers/common/python/health_track_common/   shared helpers + triage rules
  tests/                      pytest + moto (run: cd Backend && make test)
Frontend/                     React 19 + TS + Vite 8 + Tailwind v4 PWA
  src/api/                    client.ts (fetch), endpoints.ts (typed API), types.ts, mock.ts
  src/auth/                   Cognito Hosted UI via oidc-client-ts; demo sign-in when not configured
  src/config/env.ts, flags.ts per-service API URLs; feature flags (VITE_FLAG_*)
  src/offline/                Dexie DB, outbox, sync, voice recorder
  src/triage-engine/          TS copy of Backend triage rules (keep in step, has tests)
  src/design/                 tokens in src/index.css, components in design/components
  src/features/<area>/        screens
  src/app/layouts/            PublicShell, PatientShell, DoctorShell
docs/                         specs, plans, BACKEND_FEATURE_MAP.md
```

## 5. How to run and check

```bash
cd Frontend
npm install
npm run dev         # http://localhost:5173. With no API URLs set it uses the MOCK API + demo sign-in.
npm run typecheck
npm run lint
npm test            # vitest (triage engine)
npm run build
```

- **Mock mode** (`src/api/mock.ts`) mirrors the Lambda response shapes and stores data in the browser. Pick Patient or Doctor on `/sign-in` to play the whole flow. **When you change an endpoint shape, change the mock too.** The mock currently hides one real bug (push, see below).
- **Real backend:** fill `VITE_API_URL_*` and `VITE_COGNITO_*` in `Frontend/.env.local` from the CDK stack outputs. Each service has its own URL.
- Backend tests: `cd Backend && make install && make test`.

## 6. Status log (update this)

| Date | Who | What |
|---|---|---|
| 2026-10-22 | Claude Code | Created branch `feat/frontend-redesign`. Audited the whole backend and wrote `docs/BACKEND_FEATURE_MAP.md` and this file. No code changes yet. |

### Next steps (suggested order)

1. **Agree on the redesign direction** (visual language, IA) using §6.2 of the feature map. Keep the existing route structure unless the design says otherwise.
2. **Fix the API layer before restyling** (small and safe):
   - Push contract: `pushApi.vapidPublicKey` returns `{ vapid_public_key }`; `subscribe` must POST `{ endpoint, keys }` at the top level and returns `{ subscribed }`; `unsubscribe` returns `{ unsubscribed }`. Update `endpoints.ts`, `usePushSubscription.ts` and `mock.ts`.
   - Add the service keys `extended`, `channel`, `anonymous` and `i18n` to `src/config/env.ts` and `.env.example`.
   - Add typed clients for the extended, operator, anonymous and i18n endpoints (shapes in the feature map, §3.8–3.11), plus mock routes.
3. **Redesign Tier 1 screens first:** landing, facilities, triage, consult/chat, payment, doctor queue/case, profile.
4. Then the Tier 2 screens behind their flags in `src/config/flags.ts`.

## 7. Rules of thumb for this codebase

- **Backend is the source of truth for triage.** The local engine is for instant/offline display only; replace its result with the server's.
- **Every patient write must work offline**: route it through the outbox (`src/offline/outbox.ts`) with an idempotency key (`client_message_id` or a client `result_id`).
- **No realtime:** use TanStack Query polling (the current pattern is 15–20 s while visible) and show "last updated".
- **Urgency colours (RED/AMBER/GREEN) are clinical signals.** Do not reuse them decoratively. Always show "advisory, not a diagnosis" on triage results. RED results put "call / go now" before "consult".
- **Low-end Android first:** small bundles, lazy routes, large tap targets, icon + text, `prefers-reduced-motion` respected.
- **Auth:** send the Cognito **ID token** (`Authorization: Bearer`); groups come from `cognito:groups`. Roles: Patient, Doctor, Operator, Admin.
- Match the surrounding code style (Prettier config in `Frontend/.prettierrc`; `@/` path alias; shadcn/Base UI primitives; `cva` for variants).
- Do not change backend contracts from the frontend side. If a screen needs backend work, write it in the feature map's §5 gap table and flag it in the status log.

## 8. Known backend gaps that affect the UI

The full list is in `docs/BACKEND_FEATURE_MAP.md` §5. The ones that most affect UI design:
- No push events are published yet, so do not rely on notifications.
- In `dev`, payments never confirm by themselves. The pay screen needs a clear waiting/timeout state. Demo trick: POST the webhook manually (curl in the feature map, §3.5).
- There is no endpoint that lists a consultation's prescriptions or referrals. Show the code in the chat or keep it locally.
- Operators cannot list all lab requests.
- Profile DOB and sex cannot be edited through the API.
- The doctor queue items contain no patient name. Design cards around complaint, urgency, age and time waiting.
