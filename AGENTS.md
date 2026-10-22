# AGENTS.md: handoff for Codex (and any other coding agent)

> Codex reads this file automatically. It was written on 2026-10-22 by Claude Code so work can continue if Claude credits run out. Keep it current: when you finish a chunk of work, update **§6 Status log**.

## 1. Project in one paragraph

**CareBridge** (internal name **Health Track**) is an offline-first health access PWA for Buea, Cameroon. Patients find facilities, run a danger-sign triage (RED/AMBER/GREEN), consult a doctor asynchronously by text or voice (also on behalf of a household member), and pay per consultation with Fapshi mobile money. Doctors work a RED-first queue and issue prescription and referral codes. Tier 2 adds operator/admin consoles, SMS/USSD, appointments, lab tests, blood requests, emergency location share, health tips, anonymous mode and EN/FR/Pidgin.

## 2. Current goal: frontend redesign

We are **redesigning the frontend** (`Frontend/`) on top of the existing backend. **Backend issues are being handled by someone else.** We design and build only against the functionality that exists today.

> **🚦 Codex: if the owner says "go", open `docs/REDESIGN_BUILD.md` and build the pages listed under "Codex owns".** We are building the redesign directly in code now (no more Figma mockups), in tandem with Claude, with a strict file-ownership split.

Read these documents before doing anything:

👉 **`docs/REDESIGN_BUILD.md`**: the live build brief, with what's built, who owns which files, code recipes, per-page briefs and the running log.

👉 **`docs/DESIGN_SYSTEM.md`**: the redesign's tokens, components, screens and **consistency rules**. The current editable Figma source of truth is **CareBridge — Redesign v1.1**, in Bryan's Drafts: https://www.figma.com/design/NitvyVWYfvQcGEUYBkqlbF (the original `8Wm3ky7nyOCc8lF64w4539` belongs to Keukang and was view-only for Bryan).
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
| 2026-10-22 | Codex | Initially blocked by the original file's permissions. Signed into the browser as Bryan; Share showed Keukang as owner and view-only access. Resolved by duplicating the full file into Bryan's team Drafts. **Continue in `NitvyVWYfvQcGEUYBkqlbF`, CareBridge — Redesign v1.1.** |
| 2026-10-22 | Codex | **Completed existing-screen glass/spacing refinement in Figma only.** Repaired black fallback fills bound to the white glass token, restored Regular 50% / Strong 62% translucency, consistent native glass/refraction/frost/rims/shadows and instance fills. Removed glass from dense stats, softened ambient backdrops, added desktop hero padding, changed landscape body copy to the primary text token for contrast. Mobile Landing now uses auto-layout with a 24px CTA-to-preview gap (was 170px), a 900px hero (was 1050px) and continuous landscape. Promoted `TabBar/Patient` with Home/Triage variants and reused it on both app screens with content clearance. Verified screenshots for all 3 screens at 390/1440 and the affected component families; typography remains Inter/Jakarta, UI remains editable, only logo assets are raster. Updated `docs/DESIGN_SYSTEM.md`. No frontend/backend implementation or next screen batch started. **Awaiting owner review of v1.1.** |

| 2026-10-22 | Claude Code | **Owner approved v1.1 and moved to building in code.** Implemented the design system in `Frontend/`: tokens, type utilities, Liquid Glass and expressive-shape utilities (`index.css`); M3 spring motion (`design/motion.tsx`); a type-aware `cn`; redesigned Button/IconButton, primitives, Field/Chip, UrgencyBadge, FacilityRow; new AppChrome (glass NavRail, scroll-compacting TabBar, MobileTopBar, SyncStatus) and Landscape/Backdrop; all three shells. Screens done and checked at 375 and 1440: Landing, Patient Home, Triage Wizard, Triage Result, Facility list/detail. Added `extendedApi` + mocks, fixed the push contract, added `npm run dev:mock` (port 5174, mock API + demo sign-in). Navigation resolved: the same 5 destinations (Home · Triage · Consults · Facilities · Profile) on the TabBar and NavRail; Household lives under Profile. typecheck/lint/tests pass. **Tandem split in `docs/REDESIGN_BUILD.md` §3.** |

**Claude continuation:** Use the new editable file above. Pages: Foundations `0:1`, Mobile `7:657`, Desktop `7:658`. The six screen IDs in `docs/DESIGN_SYSTEM.md` §4 survived duplication. New tab-bar set `2004:162`, variants Home `2004:118` / Triage `2004:148`, screen instances Home `2005:347` / RED Result `2005:376`; old standalone bar `2:366` was replaced. Final frame sizes: mobile Landing 390×1562, Home 390×1776, RED 390×1350; desktop Landing 1440×1200, Home 1440×1112, RED 1440×900. Landing auto-layout wrapper `2005:346`. New component properties use existing variables/styles. Glass effects do not support variable bindings in Figma; their containing fill/stroke colours do.

**Review questions inherited from v1:** The spec requests identical navigation names/order but also specifies 7 rail destinations versus 5 tabs; desktop says "Consultations", mobile "Consults". Confirm the canonical navigation before implementation. Existing content parity also needs owner review (desktop RED has a map illustration, desktop Home a separate available-doctors card; mobile has no equivalent standalone cards). Sample names/counts/wait times/fees are design examples, not evidence of live data; do not hard-code claims when implementing. This pass stayed focused on glass, spacing and the reused mobile shell.

### Next steps: current (supersedes the list below)

- **Codex:** build the pages in `docs/REDESIGN_BUILD.md` §3 "Codex owns" (Profile, Household, Doctor Queue/Case, Sign-in/Callback, Code lookup, How it works, About, NotFound/RouteError). Don't edit Claude-owned or frozen shared files; log requests in that doc's §6.
- **Claude:** finishing Consult New/Chat/List and Payment, then a final cross-screen consistency QA at 375 and 1440.

### Older next steps (Figma phase, kept for history)

1. **Review Figma v1.1 with the owner** (approve / modify / refuse per screen), including the navigation/content questions above. Do not implement screens or start the next batch before approval.
2. After approval, **implement the foundations in code first**: add the new tokens (`glass/*`, `landscape/*`) to `src/index.css`, add the text styles as Tailwind utilities, the glass utility (with a `prefers-reduced-transparency` fallback), the expressive-corner utilities, and the components in §3 of the design system. Then rebuild the 3 approved screens to match Figma at both breakpoints.
3. Design the next batch in Figma **using the existing Foundations components and variables** (suggested: Facilities list/detail, Triage wizard, Consult chat, Payment, Doctor queue/case, Profile/household). Keep the 3-screens-per-batch review rhythm.
4. Small, safe API-layer fixes that the redesigned screens need (contract only; backend issues belong to the other owner):
   - Push contract: `pushApi.vapidPublicKey` returns `{ vapid_public_key }`; `subscribe` must POST `{ endpoint, keys }` at the top level and returns `{ subscribed }`; `unsubscribe` returns `{ unsubscribed }`. Update `endpoints.ts`, `usePushSubscription.ts` and `mock.ts`.
   - Add the service keys `extended`, `channel`, `anonymous` and `i18n` to `src/config/env.ts` and `.env.example`, plus typed clients and mock routes for the endpoints the new screens use (Home uses `GET /doctors/available` and `GET /health-tips`).

### Working in the Figma file (if you have Figma MCP access)

- Build only with the local variables, text/effect styles and components on the **Foundations** board. Bind every fill, radius and gap to a variable.
- File structure: page `01 · Foundations` holds tokens and components only; screens go on `02 · Mobile (390)` or `03 · Desktop (1440)`. Put each screen in its own Section named `NN Screen name` (80px padding on mobile, 120px on desktop), in one row ordered by number (gap 120 on mobile, 200 on desktop). Every screen exists on both pages with the same number and name.
- The current connected account is Salle Bryan; `whoami` reported a Full seat on the student/education team. The original Starter-plan note is historical. Batch work into few, large, retry-safe calls and handle actual tool rate-limit responses.

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
