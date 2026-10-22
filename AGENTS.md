# AGENTS.md: handoff for Codex (and any other coding agent)

> Codex reads this file automatically. It was written on 2026-10-22 by Claude Code so work can continue if Claude credits run out. Keep it current: when you finish a chunk of work, update **§6 Status log**.

## 1. Project in one paragraph

**CareBridge** (internal name **Health Track**) is an offline-first health access PWA for Buea, Cameroon. Patients find facilities, run a danger-sign triage (RED/AMBER/GREEN), consult a doctor asynchronously by text or voice (also on behalf of a household member), and pay per consultation with Fapshi mobile money. Doctors work a RED-first queue and issue prescription and referral codes. Tier 2 adds operator/admin consoles, SMS/USSD, appointments, lab tests, blood requests, emergency location share, health tips, anonymous mode and EN/FR/Pidgin.

## 2. Current goal: frontend redesign

We are **redesigning the frontend** (`Frontend/`) on top of the existing backend. **Backend issues are being handled by someone else.** We design and build only against the functionality that exists today.

Read these two documents before doing anything:

👉 **`docs/DESIGN_SYSTEM.md`**: the redesign's tokens, components, screens and **consistency rules**. The Figma file is the visual source of truth: https://www.figma.com/design/8Wm3ky7nyOCc8lF64w4539
👉 **`docs/BACKEND_FEATURE_MAP.md`**: what the backend can do (every endpoint, shape, role and gap).

## 2a. ⚠️ CONSISTENCY IS THE #1 REQUIREMENT ⚠️

The product owner **explicitly requires strict visual and behavioural consistency.** Treat any inconsistency as a bug, even if it "looks fine". Before you open a PR or mark work done, check every item:

- [ ] **Tokens only.** Every colour, radius and spacing value comes from `docs/DESIGN_SYSTEM.md` §2 (Figma variables = `Frontend/src/index.css` `@theme`). No raw hex, no arbitrary Tailwind values (`p-[13px]`, `#abc`), no new colours.
- [ ] **Components only.** Buttons, icon buttons, chips, urgency badges, facility rows, nav items, rail and tab bar come from `src/design/components`. If one is missing, build it once to match Figma, then reuse it. Never restyle a component inline.
- [ ] **Type scale only.** Use the 13 text styles (Display/Headline/Title/Body/Label/Eyebrow). Jakarta for display and headings, Inter for UI.
- [ ] **One design language.** Material 3 Expressive for structure (pill buttons, tonal containers, expressive corners, rail + FAB) and Liquid Glass **only** for navigation and floating surfaces over imagery. Never glass behind dense text.
- [ ] **Same shell everywhere.** Mobile: floating glass TabBar. Desktop: NavRail. Same destinations, names, icons and order. Public pages: glass pill nav + landscape hero + dark ground band.
- [ ] **Same screen, both breakpoints.** Every screen ships as mobile (390) and desktop (1440) with the same content and order; desktop only re-flows it into columns.
- [ ] **Urgency colours are reserved** for triage urgency (badges, RED/AMBER/GREEN heroes, rule dots). RED results always lead with "Call 15", then directions, then facility; "Ask a doctor" comes last.
- [ ] **Platform truth.** This is an offline-first health PWA for Buea on low-end Android: no invented features, numbers or claims; every screen maps to an endpoint in the feature map. Show sync/offline state wherever data is written, and keep "advisory, not a diagnosis" on every triage result.
- [ ] **Match Figma.** Compare your screen side by side with the Figma frame (node IDs in `docs/DESIGN_SYSTEM.md` §4) at 390 and 1440 widths before you call it done.

If a design question is not answered by the Figma file or `DESIGN_SYSTEM.md`, **do not improvise a new pattern**: reuse the closest existing one and note the question in §6 for the owner.

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
| 2026-10-22 | Claude Code | **Figma redesign v1** (https://www.figma.com/design/8Wm3ky7nyOCc8lF64w4539). Foundations: 43 variables, 13 text styles, 4 effect styles (native Liquid Glass), 34 icons, and the components Button, IconButton, Chip, UrgencyBadge, FacilityRow, NavItem, NavRail, StatusBar and Logo. Screens: Landing, Patient Home, Triage Result (RED), each at mobile 390 and desktop 1440. Spec in `docs/DESIGN_SYSTEM.md`. **Waiting for owner approval.** No frontend code changed yet. |

| 2026-10-22 | Codex | Owner requested Liquid Glass completion across existing components/screens and a mobile Landing whitespace fix before another batch. Read design/backend specs and pulled the redesign branch. Public preview confirms the gap below the facility CTA and nearly opaque dark navigation/preview surfaces with poor text contrast. **Blocked:** Figma MCP read/edit calls deny edit access for the connected Salle Bryan account; browser is signed out. Requested access correction. No Figma or frontend changes made. |

**Pending refinement:** Restore editor access to file `8Wm3ky7nyOCc8lF64w4539` for the connected account (`nsalleyimnaiume@gmail.com`), reconnect the owning account, or correct the file link. Then inspect all three pages, fix shared glass components/styles and instance overrides, tighten the mobile hero using existing spacing tokens, and visually verify all three existing screens at 390 and 1440. This request authorizes refinement of the existing designs; frontend implementation and the next design batch still await review.

**Access follow-up:** Browser Google sign-in succeeded, but the file still shows **Ask to edit**. Its Share panel lists **Keukang** as owner and **Anyone can view**. The connected MCP identity remains Salle Bryan. The owner/editor must invite the connected account with **Can edit**, or the user must reconnect the file-owning account. This is a Figma file permission issue, not a request for broader Codex action permissions.

### Next steps (suggested order)

1. **Wait for the owner's verdict on Figma v1** (approve / modify / refuse per screen). Do not build screens that have not been approved.
2. After approval, **implement the foundations in code first**: add the new tokens (`glass/*`, `landscape/*`) to `src/index.css`, add the text styles as Tailwind utilities, the glass utility (with a `prefers-reduced-transparency` fallback), the expressive-corner utilities, and the components in §3 of the design system. Then rebuild the 3 approved screens to match Figma at both breakpoints.
3. Design the next batch in Figma **using the existing Foundations components and variables** (suggested: Facilities list/detail, Triage wizard, Consult chat, Payment, Doctor queue/case, Profile/household). Keep the 3-screens-per-batch review rhythm.
4. Small, safe API-layer fixes that the redesigned screens need (contract only; backend issues belong to the other owner):
   - Push contract: `pushApi.vapidPublicKey` returns `{ vapid_public_key }`; `subscribe` must POST `{ endpoint, keys }` at the top level and returns `{ subscribed }`; `unsubscribe` returns `{ unsubscribed }`. Update `endpoints.ts`, `usePushSubscription.ts` and `mock.ts`.
   - Add the service keys `extended`, `channel`, `anonymous` and `i18n` to `src/config/env.ts` and `.env.example`, plus typed clients and mock routes for the endpoints the new screens use (Home uses `GET /doctors/available` and `GET /health-tips`).

### Working in the Figma file (if you have Figma MCP access)

- Build only with the local variables, text/effect styles and components on the **Foundations** board. Bind every fill, radius and gap to a variable.
- File structure: page `01 · Foundations` holds tokens and components only; screens go on `02 · Mobile (390)` or `03 · Desktop (1440)`. Put each screen in its own Section named `NN Screen name` (80px padding on mobile, 120px on desktop), in one row ordered by number (gap 120 on mobile, 200 on desktop). Every screen exists on both pages with the same number and name.
- **The Figma account is on the Starter plan, so MCP tool calls are rate-limited.** Batch work into few, large, retry-safe calls.

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
