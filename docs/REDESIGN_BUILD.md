# Frontend Redesign: Build Brief (Claude ⇄ Codex tandem)

> **Codex: start here.** The owner said "go". Build every page in **§3 Codex owns** to match the system already in code. Read `AGENTS.md` §2a (consistency rules) and `docs/DESIGN_SYSTEM.md` first. Branch: `feat/frontend-redesign`.
>
> **No more Figma mockups.** We build straight in code. The Figma file (`NitvyVWYfvQcGEUYBkqlbF`) is the reference for the look of the 3 finished screens; everything else follows the code patterns below.

---

## 1. The vibe: best of both worlds

- **Material 3 Expressive** = structure and motion. Bold display type, pill buttons that squash and morph their corners on press, expressive asymmetric shapes (`shape-bl` etc.), tonal containers, an extended FAB, spring physics everywhere, a morphing loading shape, and springy shared-layout indicators.
- **iOS Liquid Glass** = chrome that floats over content. The rail, tab bar, top bars, floating action bars, chips and cards over imagery get `glass` / `glass-strong`. A blurred, drifting ambient backdrop sits underneath so the glass always has something to refract.
- **Never** put glass behind dense reading content (lists, forms, chat threads): those sit on solid white `rounded-xl` cards.
- **Ample animation, always purposeful:**
  - entrance: stagger + pop-in on every screen;
  - press: scale + corner morph;
  - state changes: `AnimatePresence`;
  - shared indicators: `layoutId`.

  Respect reduced motion; `MotionConfig reducedMotion="user"` is already set in `main.tsx`.

## 2. Status: what's already built (Claude)

| Area | Files | State |
|---|---|---|
| Tokens, type scale, glass, shapes, keyframes | `src/index.css` | ✅ done |
| Motion system | `src/design/motion.tsx`: `SPRING`, `popIn`, `staggerOnMount`, `PageTransition`, plus the older `Reveal` / `Stagger*` | ✅ done |
| Class merging that knows our type scale | `src/lib/utils.ts` (`cn` via `createCn`) | ✅ done: **keep using `cn`** |
| Buttons | `design/components/Button.tsx`: `Button`, `ButtonLink`, `ButtonA` (variants `primary · tonal · glass · secondary · light · ghost · danger · outline-light`, `icon` prop), `IconButton`, `IconLink`, `IconRouterLink`, `LinkArrow` | ✅ |
| Primitives | `design/components/primitives.tsx`: `Card`, `InfoCard`, `AdvisoryNote(long)`, `PageSpinner` (morphing shape), `StatusMark`, `EmptyState`, `Avatar`, `PageHeader(eyebrow)`, `SectionHeader`, `Notice` | ✅ |
| Forms | `design/components/Field.tsx`: `Field`, `Input`, `Textarea`, `Select`, `ChoiceCard` (morphs when selected), `Chip` | ✅ |
| Chrome | `design/components/AppChrome.tsx`: `PATIENT_DESTS`, `NavRail`, `TabBar` (compacts on scroll), `MobileTopBar`, `SyncStatus`, `AccountButton` | ✅ |
| Scenery | `design/components/Landscape.tsx`: `Landscape` (Mount Cameroon parallax) and `Backdrop` (tones `brand · red · amber · green`, portalled to `<body>`) | ✅ |
| Domain components | `FacilityRow` (+ `CAPABILITY_ICON`, `primaryCapability`), `UrgencyBadge` / `UrgencyDot` / `URGENCY_META`, `ChatBubble`, `HoldToRecord`, `OfflineBanner` | ✅ |
| Shells | `app/layouts/PublicShell.tsx`, `PatientShell.tsx`, `DoctorShell.tsx` | ✅ all use the new chrome and page transitions |
| Screens | Landing, Patient Home, Triage Wizard + Breath counter, Triage Result, Facility list, Facility detail | ✅ verified at 375 and 1440 |
| Screens (Claude, in progress) | Consult New, Consult Chat, Consult List, Payment | 🟡 Claude owns these: do not touch |
| API layer | `extendedApi` (`/doctors/available`, `/health-tips`), push contract fixed, `VITE_API_URL_EXTENDED` | ✅ |

A legacy-class → token codemod has already run over the Codex-owned files, so they compile with token classes but are **not yet redesigned**. Treat them as raw material.

## 3. File ownership (do not cross it)

**Codex owns, and builds now:**

| # | Page / file | Route |
|---|---|---|
| C1 ✅ | `features/profile/Profile.tsx` | `/app/profile` |
| C2 ✅ | `features/profile/Household.tsx` | `/app/profile/household` |
| C3 | `features/doctor/DoctorQueue.tsx` | `/doctor` |
| C4 | `features/doctor/DoctorCase.tsx` | `/doctor/case/:id` |
| C5 | `features/auth/SignIn.tsx` + `features/auth/AuthCallback.tsx` | `/sign-in`, `/auth/callback` |
| C6 | `features/public/CodeLookup.tsx` | `/rx/:code`, `/ref/:code` |
| C7 | `features/public/HowItWorks.tsx` | `/how-it-works` |
| C8 | `features/public/About.tsx` | `/about` |
| C9 | `features/public/NotFound.tsx` + `app/RouteError.tsx` | `*` and error boundary |

**Claude owns:** everything in §2, plus `features/consult/*`, `features/payments/*` and the final cross-screen QA pass.

**Shared files are frozen for Codex:** `index.css`, `design/motion.tsx`, `lib/utils.ts`, and all **existing** files in `design/components/` and `app/layouts/`. If you need a new shared component, add a **new file** in `design/components/` and record it in §6. If you need a change to a frozen file, write the request in §6 instead of editing it, and keep going with a local workaround.

## 4. Recipes (copy these patterns exactly)

**Page skeleton (in-app):**
```tsx
<motion.div variants={staggerOnMount(0.06)} initial="hidden" animate="show" className="flex flex-col gap-5">
  <PageHeader eyebrow="Profile" title="Your profile" subtitle="…" />
  <motion.section variants={popIn} className="rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]">…</motion.section>
</motion.div>
```
- Hero bands over scenery: `relative isolate overflow-hidden rounded-xl lg:rounded-2xl`, plus `<Landscape className="-z-10" preserve="xMidYMid slice" />` and a `glass-strong … shape-bl` card inside (see `FacilityDetail.tsx`).
- Lists: `motion.ul variants={staggerOnMount(0.05)}` with `motion.li variants={popIn} layout`. Rows are solid white `rounded-xl` cards. Hover lifts with `shadow-[var(--shadow-elev-2)]`.
- Back buttons: `<IconButton icon={ArrowLeft} label="Back" variant="glass" … />`.
- Floating primary action on mobile: `className="sticky bottom-[104px] z-20 lg:bottom-4"`, so it clears the glass tab bar.
- Success / waiting / error outcomes: `<StatusMark state=… icon=… />`, never urgency colours.
- Expressive tiles: `motion.div style={{ borderRadius: "40px 16px 40px 40px" }} whileHover={{ borderRadius: "32px", y: -3 }}` (see `Tile` in `PatientHome.tsx`).
- Mobile grids: always `grid-cols-[minmax(0,1fr)]` before the `lg:` columns, or truncated text widens the page.
- Text: only the utilities `text-display-{xl,l,m}`, `text-headline-{l,m,s}`, `text-title-{l,m}`, `text-body-{l,m}`, `text-label-{l,m}` and `eyebrow`. No `text-[15px]`, no `font-extrabold` on raw sizes.
- Radius: `rounded-sm|md|lg|xl|2xl|full` (12/16/24/32/40) or `shape-bl|br|tl|tr`. No `rounded-[…]`.
- Colours: tokens only (`brand-*`, `mint`, `mint-200`, `cream`, `ink-*`, `line`, `ground`, `land-*`). `urgent-*` only for triage urgency.

## 5. Page briefs (Codex)

- **C1 Profile:**
  - Header band: avatar and name in a glass card over `Landscape`.
  - Solid cards for display name and language (`PUT /profile` accepts only `display_name` and `locale`; DOB and sex are read-only, see the feature map).
  - A household entry tile linking to `/app/profile/household`, and a notifications toggle (`usePushSubscription`; the contract is already fixed).
  - Sign-out as a `secondary` button.
  - Keep all the existing logic.
- **C2 Household:**
  - Member cards with an expressive `Avatar` and the details "relationship · age".
  - An "Add member" `ChoiceCard`-style form that animates open with `AnimatePresence` and height.
  - Delete with a confirm step.
  - Max 10 members (the server enforces it; show the count). Members animate in and out with `layout`.
- **C3 Doctor Queue** (desktop-first, still responsive):
  - Glass stat chips: counts by urgency.
  - A RED-first list where each card shows `UrgencyBadge`, the complaint, the age (from the triage payload when present) and time waiting (`timeAgo`). There is no patient name: the backend doesn't send one.
  - "Claim" uses the `primary` button for `paid` cases; `open` cases show "Continue".
  - Cards reorder with `layout` when the 20 s poll changes the order.
  - Optional: a presence heartbeat via `PUT /doctor/presence` on the extended API. Add an `extendedApi.presence` client in a **new** file `src/api/doctor-presence.ts` if you do it.
- **C4 Doctor Case:** two columns on desktop.
  - **Left:** the thread (`ChatBubble`, solid surface) plus a glass composer, the same recipe as the patient chat (see `features/consult/ConsultChat.tsx` once Claude pushes it).
  - **Right:** the triage audit card, the same rule list as `TriageResult.tsx` (`UrgencyDot` + rule id), then the prescribe and refer forms (solid cards), then close.
  - Issued codes appear with the `CodeCard` look: mint with `shape-bl`. Keep all the existing mutations.
- **C5 Sign-in:**
  - A centered `glass-strong shape-bl` panel over a full-bleed `Landscape`.
  - Logo, then the existing Cognito / demo buttons (`primary` and `secondary`, with `icon`).
  - AuthCallback: the `PageSpinner` morph with a short status line.
- **C6 Code lookup:**
  - A public pharmacy/facility view: a big monospace code chip, the status (active, dispensed or used) and the details card.
  - Show minimum data only (no patient id).
- **C7 How it works / C8 About:**
  - Same public language as Landing: an eyebrow, `text-display-m` headings, `Reveal` / `StaggerContainer` on scroll, expressive step cards like Landing's `Steps`, and the dark `bg-ground` band for a statement.
  - Make no new claims beyond `docs/BACKEND_FEATURE_MAP.md`.
  - Keep the existing anchor ids (`#help`, `#providers`, `#contact`, `#privacy`) because the footer links to them.
- **C9 NotFound / RouteError:** an `EmptyState`-style card with `StatusMark state="info"`, plus Home and Back actions.

## 6. Running log and requests (both agents append here)

| When | Who | Note |
|---|---|---|
| 2026-10-22 | Claude | Foundations, chrome, Landing, Home, Triage, Facilities done. Starting Consult + Payment. Codex: go on §3. |
| 2026-10-22 | Codex | C1 Profile redesigned and checked at 375/1440; demo name save verified. Landscape/glass identity card, solid editable name/locale form, household entry, push availability, storage refresh/clear confirmation and sign-out. Added shared `design/components/Feedback.tsx` (neutral feedback, reusable confirmation and code-card presentation) without editing frozen components. |
| 2026-10-22 | Codex | C2 Household redesigned: animated add form, member cards, 10-member cap, online/write status and inline removal confirmation. Verified a demo member save, confirmation/cancel and 375/1440 layout. |
| 2026-10-22 | Codex request | Profile/household writes cannot currently join the outbox (it supports triage/consultations/messages only, and household POST has no idempotency key). Retaining online-only writes with clear connection status; request a shared offline/idempotency design before promising offline profile edits. Existing frozen Notice/StatusMark use urgency backgrounds for non-clinical outcomes, and ChatBubble has off-scale type/radii; please reconcile during Claude's final shared-component QA. |

## 7. How to run, verify and hand back

```bash
cd Frontend
npm install
npm run dev:mock     # http://localhost:5174 — mock API + demo sign-in (Frontend/.env points at the real backend + Cognito)
npm run typecheck && npm run lint && npm test
```
- Verify **every page at 375×812 and 1440×900**: no horizontal scroll (`document.documentElement.scrollWidth === clientWidth`), nothing hidden behind the tab bar, text readable on glass.
- For the doctor pages, sign in as the demo doctor on `/sign-in` in mock mode.
- Pull often: `git pull --rebase` before each commit. Commit per page: `feat(frontend): redesign <page>`. Push after each page so Claude sees it.
- When a page is done, tick it in §3 (add ✅) and log it in §6.
