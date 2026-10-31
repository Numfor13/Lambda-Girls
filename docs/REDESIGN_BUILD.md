# Frontend Redesign: Build Brief (Claude ⇄ Codex tandem)

> **🆕 2026-10-23: design language v2 supersedes the visual rules below. Read `docs/DESIGN_LANGUAGE.md` first.** The owner found the pages generic, so Claude studied 25 reference platforms (Apple, Stripe, Linear, Airbnb, One Medical, Oscar, Ada, NHS 111…) and changed the language: Fraunces serif display, calm surfaces, small radii, chrome-only glass, no-bounce motion. Colours are unchanged. The tokens are already in `index.css`, so your pages have inherited most of it. **Codex: during Batch 3, bring your pages in line with §4–§6 of that doc, and copy the reference pages it lists (Landing, Home, Facilities list/detail, Triage wizard).** Where this brief says "glass cards", "asymmetric shapes", "spring bounce" or "no serif", that guidance is retired.

> **Codex: start here → Batch 3 (§3c) is the priority.** The owner reviewed the built pages (2026-10-23) and rejected most of the ones that weren't designed: they look tacky, don't follow the inspiration image, Liquid Glass or M3 Expressive, have **no form validation**, miss many small and large UX features, and **waste space** at every desktop size. §0 and §3c say exactly what to fix. Finish any Batch 2 work in flight first, but do not ship new pages without meeting §3c.
>
> Batch 1 (C1–C9) is done ✅. Batch 2 is in §3b (Tier 2 features that have endpoints but no screens yet). Same rules: match the system already in code. Read `AGENTS.md` §2a (consistency rules) and `docs/DESIGN_SYSTEM.md` first. Branch: `feat/frontend-redesign`.
>
> **No more Figma mockups.** We build straight in code. The Figma file (`NitvyVWYfvQcGEUYBkqlbF`) is the reference for the look of the 3 finished screens; everything else follows the code patterns below.

---

## 0. The inspiration image (owner's reference: open it)

**File:** `C:\Users\Bryan\OneDrive\Pictures\Screenshots\Landing Page.webp` (2048×1536, the RANTY architecture landing page). It lives outside the repo; open it directly. It is the reference for **composition and confidence**, not for colours or imagery: keep our green tokens, Plus Jakarta/Inter and the Mount Cameroon landscape.

What to take from it, on every public page and in spirit on app pages:
1. **Full-bleed scene.** The landscape runs edge to edge and the content sits *on* the scene. No content trapped in a centred box with empty margins.
2. **One huge, confident headline** (2–5 words) on the left. Nothing competes with it: no stacked badges, no paragraph walls.
3. **A solid white feature card on the right**: chips row at the top (one filled, the rest outlined), a title, one line of support. **An object breaks out of its bottom edge** (in RANTY, the house). For us: a phone, a UI vignette, an illustration.
4. **A bottom band that uses every column**: an edge-flush panel on the left (only its inner top corner rounded), a stat in the middle (with avatars or an icon), and an uppercase statement with an underlined link on the right.
5. **Calm density.** Few elements, each large and deliberate; whitespace is *shaped*, never leftover.

What **not** to copy: the brown palette, serif display type, stock photography, slashes around text (the owner dislikes them), invented numbers (RANTY's "12m+ customers": we only show true counts from data/config).

Built for this in code (Claude, 2026-10-23):
- ~~`design/components/PublicHero.tsx`~~ **Removed 2026-10-27** (QA P1: every page looked the same). Public pages now use `design/components/PublicPage.tsx` (`PublicIntro`, `PublicSection`); see `docs/DESIGN_LANGUAGE.md` §5.

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
| C3 ✅ | `features/doctor/DoctorQueue.tsx` | `/doctor` |
| C4 ✅ | `features/doctor/DoctorCase.tsx` | `/doctor/case/:id` |
| C5 ✅ | `features/auth/SignIn.tsx` + `features/auth/AuthCallback.tsx` | `/sign-in`, `/auth/callback` |
| C6 ✅ | `features/public/CodeLookup.tsx` | `/rx/:code`, `/ref/:code` |
| C7 ✅ | `features/public/HowItWorks.tsx` | `/how-it-works` |
| C8 ✅ | `features/public/About.tsx` | `/about` |
| C9 ✅ | `features/public/NotFound.tsx` + `app/RouteError.tsx` | `*` and error boundary |

## 3b. Batch 2: Codex builds now (Tier 2 screens)

Every screen below maps to an endpoint in `docs/BACKEND_FEATURE_MAP.md` §3 and sits behind its existing feature flag in `src/config/flags.ts`. Build the page, flip its flag default to `true` in the **same commit** once it works in mock mode, and keep the flag so it can be switched off.

**For this batch Codex also owns the API/config/routing layer** (Claude will not touch these until Codex logs "Batch 2 done" in §6):
- `src/App.tsx`: add routes (lazy, flag-gated like the `rx/:code` routes).
- `src/config/env.ts`, `.env.example`: add the missing services `channel` and `anonymous` (same `pick()` pattern as `extended`).
- `src/config/flags.ts`: flip defaults as pages land.
- `src/api/types.ts`, `src/api/endpoints.ts`, `src/api/mock.ts`: **append only**. New typed clients go in endpoints.ts after `extendedApi` (or in new files under `src/api/`). Mock routes go in the existing `routes` array in mock.ts and must mirror the Lambda shapes exactly. Seed believable mock data (no invented live numbers in the UI).
- `src/auth/*`: extend the **demo** sign-in with `Operator` and `Admin` roles so the consoles can be exercised in `dev:mock`. Never touch the Cognito path beyond role routing.
- New shells: `app/layouts/OperatorShell.tsx`, `app/layouts/AdminShell.tsx` (**new files**, built like `DoctorShell.tsx`: same `NavRail`/`TabBar`/`Backdrop` from `AppChrome.tsx`, own destination list).

| # | Screen | Route | Endpoints | Flag |
|---|---|---|---|---|
| C10 | Health tips feed (public) | `/tips` | `GET /health-tips` (`locale`, `tag`, `limit`, `next_token`) | `health_tips` |
| C11 | Appointments: list + request + cancel | `/app/appointments` | `POST/GET/DELETE /appointments` | `appointments` |
| C12 | Lab tests: list + request + status timeline | `/app/labs`, `/app/labs/:id` | `POST/GET /lab-requests`, `GET /lab-requests/{id}` | `lab_tests` |
| C13 | Blood request | `/app/blood` | `POST /blood-requests` (show the returned `blood_bank_facilities` with tap-to-call) | `blood` |
| C14 | Emergency "share my location" | component `design/components/EmergencyShare.tsx` (**new file**) | `POST /emergency` | `emergency` |
| C15 | History + receipts | `/app/history` | `GET /triage`, `GET /consultations`, `GET /payments`, `GET /payments/{id}` | `consult_history`, `receipts` |
| C16 | Operator console | `/operator` (+ sub-routes) | callbacks list/handle, dispatch log (facility search via `GET /facilities?capability=`), emergencies list, blood requests list, lab status update by ID | `operator_console` |
| C17 | Admin console | `/admin` (+ sub-routes) | facilities create/edit, health tips CRUD, appointments to confirm (`GET /appointments?status=requested`, `PUT …/confirm`) | `operator_console` |
| C18 | Ask anonymously | `/ask` (+ `/ask/:id`) | `/anonymous/*` (session token stored locally, text only, anonymous pay) | `anonymous` |
| C19 | Doctor presence toggle | inside `DoctorQueue.tsx` (yours) | `PUT /doctor/presence` heartbeat while available | `doctors_available` |

**Page briefs, batch 2:**
- **Entry points:** patient pages are reached from a new **"Services"** section in `Profile.tsx` (your file): solid list rows with an icon, a title and a one-line description, each flag-gated. **Do not add TabBar/NavRail destinations**: the 5 patient destinations are fixed. Claude adds Home tiles later; log the routes in §6.
- **C10 Tips:** public-shell page in the Landing language (eyebrow, `text-display-m`, landscape hero), tag `Chip`s, solid tip cards with `source_name`, `published_date` and the external `source_url` link. Paginate with a "Load more" `tonal` button on `next_token`. Every tip shows its source: no unsourced health advice.
- **C11 Appointments:** list grouped Upcoming / Past with a neutral status chip (`requested · confirmed · cancelled`; neutral tones, **not** urgency colours). Request form: facility `Select` (from the facilities cache), a date input (today or later), `ChoiceCard`s for morning / afternoon / evening and an optional note. Cancel with the inline confirm pattern from Household. Say on screen that the facility must confirm.
- **C12 Labs:** request form (test type, facility, optional collection address). The detail page shows a 4-step M3 stepper `requested → sample collected → results ready → delivered` (springy progress, brand colours) and `result_summary` when present.
- **C13 Blood:** facility, blood type (8 `Chip`s), units (1–20 stepper), urgency. This is the one place outside triage where urgency is the user's own clinical choice: reuse the `UrgencyBadge` styling for the urgency picker only. After submit, list `blood_bank_facilities` as `FacilityRow`-style rows with call buttons.
- **C14 Emergency share:** a `danger` button "Share my location with the operator" that asks for geolocation, posts once, then shows `StatusMark state="done"` with the time and "Operators can see this for 24 hours". Handle denied permission and offline (it needs a connection; never queue silently). Log it in §6 when ready; **Claude wires it into the RED triage result** (`TriageResult.tsx` is Claude's).
- **C15 History:** one timeline, newest first, mixing triage results (`UrgencyBadge`), consultations (status) and payments (amount, status). Receipts open `GET /payments/{id}` and show `receipt_data` on a solid card with a share/print action.
- **C16/C17 Consoles:** desktop-first, still responsive at 375. Same chrome language as the doctor console. Tables are solid white `rounded-xl` cards with sticky headers; glass only for chrome and stat chips. RED-first ordering wherever urgency exists. Visible-only polling (20 s) with "last updated", like `DoctorQueue`. Lab gap: operators can only open a lab request **by ID** (feature map §5 #10), so design a lookup field, not a fake list.
- **C18 Anonymous:** public-shell flow. Say clearly that the session lasts 7 days on this phone only, and that it is text only (no voice). Reuse the consult chat layout recipe (`ConsultChat.tsx` patterns) in your own new files; do not import from or edit `features/consult/*`.
- **C19 Presence:** an "Available / Away" switch in the queue header. While Available and the tab is visible, `PUT /doctor/presence` every 2–3 minutes.

## 3c. Batch 3: quality rework (Codex, priority)

### The bar every page must meet (check each one before you call a page done)

**A. Space: use the screen** (owner: "the screens waste a lot of space on different viewports")
- Every in-app page (patient, doctor, operator, admin) uses **`<AppPage>`** from `design/components/AppPage.tsx`: a full-width header (eyebrow, title, subtitle, actions on the right), then `split` (main + sticky context `aside`) or `full` (for card grids and tables). Lists of cards use **`<CardGrid>`**; sections use **`<Panel>`**.
- The patient shell now gives pages up to 1320px. `PatientShell.tsx` has a temporary **`LEGACY_NARROW`** list (profile, appointments, labs, blood, history) that keeps your old 768px column so nothing stretches. **Remove each entry when you move that page onto AppPage; the list must be empty when Batch 3 is done.**
- A form never stretches across the full width. Put the form in the main column and use the aside for what helps the decision: summary, status, rules ("a facility must confirm"), recent items, help, the Call 15 card. See `ConsultNew.tsx`, `Payment.tsx`, `ConsultList.tsx`, `ConsultChat.tsx` and `TriageWizard.tsx` (desktop aside) for the pattern.
- Console pages (doctor/operator/admin): data tables at ≥1024px with sticky headers, row actions and a selected-row detail panel on the right; card lists below 768px. Stat chips at the top.
- Targets: at 1280×620, 1536×730 and 1920×960 the page content spans the whole content area (no blank third of the screen), and the primary action is above the fold at 1280×620.

**B. Forms: validation and feedback** (owner: "no form validation")
- Use **`useForm` + `rules`** from `src/lib/form.ts` (`required`, `minLength`, `maxLength`, `phone` for Cameroon mobile money, `intRange`, `notPast`, `notFuture`; `normalisePhone`, `todayIso`). `Field` now takes `required`, `error`, `count` + `max` (character counter); controls turn red through `aria-invalid`.
- **Never disable a submit button just because input is invalid.** Errors show on blur and for every field on submit; the first invalid field gets focus. Disable only while sending (`loading`) or when offline (and say so).
- Every text input has a sensible `maxLength` and, for long text, a counter. Dates use `min`/`max` attributes **and** the rules. Phone fields use `type="tel"`, a placeholder like `677 000 000`, and are normalised before sending.
- Enter submits single-line forms. Prevent double submit. After success, show a **toast** (`toast("Appointment requested")` from `design/components/Toast.tsx`; `<Toaster />` is mounted in the Patient/Doctor/Public shells, so **mount it in `StaffShell.tsx` too**), and reset or route on.
- Dirty forms warn before leaving (in-app confirm plus `beforeunload`). Drafts that already autosave keep doing so.
- Destructive actions: inline confirm (your `ConfirmAction`), then a toast with **Undo** where the API allows it (otherwise say clearly that it can't be undone).

**C. The small and big UX features that are missing**
- **Lists:** search, filter chips with counts, sort, result count, "clear filters", and "Load more" or pagination when the API pages (`next_key` / `next_token`).
- **States:** skeletons shaped like the content while loading (not a lone spinner), empty states with the next action, errors with Retry, offline state with what still works, and "last updated" on polled data.
- **Detail views:** a status stepper for anything with stages (lab requests, appointments, blood requests, consultations), timestamps in plain words ("2 h ago"), copy buttons for codes and references, a tap-to-call for phone numbers, and "what happens next" text.
- **Navigation:** back links on every detail page, breadcrumbs or a section title in console pages, and active filters kept in the URL query so refresh and back keep them.
- **Accessibility:** a real `<label>` for every control, 44px targets, visible focus, `aria-live` for async results, and `prefers-reduced-motion` respected (MotionConfig already handles motion).

**D. Look: M3 Expressive + Liquid Glass, consistently**
- Public pages (superseded 2026-10-27, see `PublicPage.tsx`): `PublicHero` + `FeatureCard` (+ a `breakout` object) + `StatementBand`, then content sections on solid surfaces with expressive shapes (`shape-*`) and display type. Each page gets its own breakout object and facts, never a copy of Landing.
- App pages: solid white `Panel`s for reading and forms, mint tonal panels for guidance, expressive tiles for navigation choices, glass **only** for chrome (rail, tab bar, top bars, sticky action bars, toasts, chips over imagery).
- Motion: page stagger (`AppPage` does it), springy list layout changes, morphing selection (`ChoiceCard`), success `StatusMark`. No static, "Bootstrap-looking" pages.

### Page-by-page rework (Codex-owned files)

| Page | What's wrong now (owner review + Claude audit at 1536×730) | Do this |
|---|---|---|
| Profile `/app/profile` | 768px column with ~300px empty on each side; identity card is a glass slab over a cropped landscape; the save button floats beside the fields | AppPage `split`. Main: details form (useForm: name required, 2–100 chars) and language. Aside: identity card (avatar, phone, sync status), Household summary (count + avatars + Manage), notifications toggle, "Saved on this phone" storage panel, sign-out. Toast on save. Remove from `LEGACY_NARROW`. |
| Household | Narrow single column | AppPage `split`: member cards in a `CardGrid` (expressive avatar, relationship · age) with the add form in the aside on desktop (sheet/expander on mobile). Rules: name required, DOB required + `notFuture`, sex, relationship; count `n/10`; remove → confirm → toast. |
| Appointments | Form floats in a white slab with a stray "Up to date" chip; disabled button with no reason; no list structure | AppPage `split`. Main: Upcoming / Past tabs with status stepper cards (requested → confirmed / cancelled), cancel with confirm + toast. Aside: "Request a visit" form (facility select with search, date `notPast`, time-of-day ChoiceCards, note `maxLength` 300) + "A facility must confirm" note. |
| Lab tests + detail | Narrow; no validation | List as a `CardGrid` with a 4-step progress per card; detail page with a large stepper, result summary panel and facility contact; the request form in the aside with rules. |
| Blood request | Narrow; no validation | Form main (blood type chips required, units 1–20 stepper with `intRange`, urgency picker, facility required); aside: what happens next + the returned blood-bank contacts as call rows after submit. |
| History & receipts | Narrow | AppPage `full`: filter chips (All / Checks / Consults / Payments) with counts, a grouped timeline by day, and receipt detail in a side panel on desktop (route or drawer) with Share/Print. |
| Health tips `/tips` | Generic glass hero; bare select + chips; two-up cards that leave gaps | `PublicHero` (`size="page"`) with the feature card listing topics; then a sticky filter bar (language, topic chips with counts, search) and a `CardGrid` of tips with source + date; "Load more". |
| Ask anonymously `/ask` | Generic glass hero; narrow 690px card; mostly text | `PublicHero` with a breakout "private chat" vignette; a 3-step explainer; the start/continue panel as the feature card action; chat view on the `ConsultChat` two-column pattern (your own files). Message `maxLength` 4000 with counter. |
| Sign in | Single centred card on a landscape: the classic "tacky" login | Split: left full-height scene with a large "Welcome back." headline and 3 short reasons (offline, household, Mobile Money); right a solid white panel with the role buttons (demo) / Cognito button, an "Explore without an account" link and the safety line. |
| How it works ✅ (Claude, **reference implementation**) / About | How it works is rebuilt: copy its structure for every public page | **Open `features/public/HowItWorks.tsx` first:** `PublicHero` with a headline, a `FeatureCard` and a `breakout` object labelled "Example", then a `StatementBand` as the hero's child (real fee from config), a full-width journey of 3 connected steps, each with its own action, and Help as a sticky heading plus expandable `<details>` answers. About: same structure with its own breakout (e.g. a Buea map vignette) and real facts (facility count from the seed). Keep the anchor ids. |
| Rx / referral lookup | Unreviewed against the bar | `PublicHero` `page` with the code as the headline in a monospace chip, status stepper (issued → dispensed/used), a details panel, a copy button, and a lookup form with validation for 8-character codes. |
| NotFound / RouteError | OK functionally | Keep, but use a scene (Landscape) and a search box or the 3 quick routes as expressive tiles. |
| Doctor queue / case | Check against A–D | Queue: table on desktop (urgency, complaint, waiting, status, action) + a selected case preview aside; stat chips; presence switch in the header. Case: keep the two columns; add validation to prescribe/refer (medication required, instructions `maxLength`, referral facility required); toasts on issue/close. |
| Operator + Admin consoles | Not reviewable (audit sign-in failed in mock; re-check) | Apply A–D: tables, filters in URL, row detail aside, validated forms (facility create/edit: name, region, quarter, phone `rules.phone`, lat/lng ranges; tips: title, body, source required, date `notFuture`), confirm + toast on every write. |

**Definition of done for Batch 3:** every row above meets A–D; `LEGACY_NARROW` is empty; screenshots in real Chrome at **375×812, 1280×620, 1536×730, 1440×900 and 1920×960** show no blank thirds, no horizontal scroll and the primary action above the fold at 1280×620. Typecheck, lint, tests and build pass. Log each page in §6 as you finish it.

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
- **Glass (updated 2026-10-23):** `glass` / `glass-strong` now have a low fill so the backdrop shows through, plus a sheen, a gradient rim and an inner glow. That makes them even less suitable behind dense text: keep forms, lists, tables and long copy on solid white cards. A `Landscape` that starts below the top of its section gets `fade-top` (no sky seam on wide screens).
- **Short desktops:** most of our users' laptops are 1920×1080 at 125–150% Windows scaling, i.e. **1536×730 or 1280×620 CSS px**. Never size by width alone: use `min(…vw, …svh)` in clamps and `clamp(…, …svh, …)` for big vertical padding (see the Landing hero). Primary actions must be above the fold at 1280×620.
- **Desktop two-column forms:** a wizard-like form uses a flex column on mobile and `lg:grid lg:grid-cols-[minmax(0,1fr)_360px]` on desktop, with the summary and primary action in a `contents lg:sticky lg:top-6` aside (see `ConsultNew.tsx`, `Payment.tsx`). Same content and order on both widths.

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
| 2026-10-23 | Claude | **Full UI/UX QA of every screen and role: `docs/QA_2026-10-23.md`.** Four bugs fixed and pushed: operator lists crashed when empty; Home offered "Pay" for a paid case; two form fields had no label; Home had duplicate headings. **Codex: work through the "Open findings for Codex" tables** (C1–C7 cross-cutting first, then P/S/K). The biggest items are empty lists opening with full search, sort and filter controls, the same hero template on every public page, the Ask anonymously and Sign-in rebuilds, and the doctor counters not adding up. |
| 2026-10-23 | Claude | **Design language v2** (`docs/DESIGN_LANGUAGE.md`). We captured 31 sites in real Chrome and read their computed CSS; 25 loaded and 6 were bot-blocked. Tokens rebuilt: Fraunces display + Inter, radius 10/14/18/24/32, hairline + layered shadows, crisp chrome-only glass, critically damped springs, a still paper `Backdrop`, and a live serif wordmark in `Logo`. Components: Button (no hover scale or corner morph), Field, Chip, ChoiceCard, FacilityRow (hours, tags, distance, 2-line names on mobile), the flush sidebar, TabBar, and the public nav and footer. Pages rebuilt: **Landing** (working "What do you need?" panel, landscape band into the facts strip, product bento, safety band), **Home** (accent greeting, one dark hero, full-width actions), **Facilities** (segmented search, service counts aside), **Facility detail** (editorial header, sticky "Getting there" aside), **Triage wizard** (segmented progress, stepper aside, two-up symptoms). Checked in real Chrome at 375×812, 1280×620, 1536×730, 1440×900 and 1920×960: no overflow. **Codex:** your uncommitted How it works, About, Sign-in, CodeLookup, services, profile and console edits were left untouched. Bring them onto v2 (§6 of the doc lists what to remove). |
| 2026-10-23 | Codex | **Batch 2 implementation checkpoint:** added lazy flag-gated tips, appointments, labs/detail, blood, history/receipts, operator/admin routes and shells, anonymous session/text/payment flow and doctor presence. Profile Services links preserve the 5 patient destinations. Extended/channel/anonymous clients and mocks are in new API files; original clients remain intact. New shared files: `ServicePage`, `ServiceLinks`, `ConsoleData`, `EmergencyShare`; drafts are scoped to the signed-in identity and cleared on sign-out. Anonymous text uses a persistent, session-scoped outbox and stable message IDs, with expiry and closed/payment gating. |
| 2026-10-23 | Codex QA checkpoint | Mock appointment create/cancel, distinct Patient → Admin confirmation, lab create and full Operator status chain with result summary, blood request/contact response, callback handling, filtered dispatch, facility create/edit, sourced tip create/edit + delete-confirm/cancel, anonymous session/create/mock payment/text delivery, receipt read and doctor presence on/off verified. Operator/admin and public service pages checked at 375/1280/1440/1536/1920 with no page overflow; screenshots are in the task visualization folder. Tooling exposes the in-app Chromium browser, not a separate Chrome connector. Actual geolocation/permission prompts, real Fapshi, Cognito, print dialog and network-failure injection were not exercised. **Batch 3 quality rework is now priority; do not treat this functionality checkpoint as visual approval.** |
| 2026-10-23 | Codex backend request | Appointment/lab/blood/anonymous-consultation POSTs do not accept an idempotency key. Their forms retain local drafts and require explicit connected submission; do not silently retry these writes or claim they joined the existing outbox. Doctor Away stops heartbeats, but the backend can list the doctor for five more minutes. Inactive facilities cannot be read even by Admin; inactive tips cannot be listed/read by ID. These limits are recorded in the feature map. |
| 2026-10-22 | Claude | Foundations, chrome, Landing, Home, Triage, Facilities done. Starting Consult + Payment. Codex: go on §3. |
| 2026-10-22 | Codex | C1 Profile redesigned and checked at 375/1440; demo name save verified. Landscape/glass identity card, solid editable name/locale form, household entry, push availability, storage refresh/clear confirmation and sign-out. Added shared `design/components/Feedback.tsx` (neutral feedback, reusable confirmation and code-card presentation) without editing frozen components. |
| 2026-10-22 | Codex | C2 Household redesigned: animated add form, member cards, 10-member cap, online/write status and inline removal confirmation. Verified a demo member save, confirmation/cancel and 375/1440 layout. |
| 2026-10-22 | Codex | C5 auth: landscape + glass sign-in, accessible loading/error feedback and existing Cognito/demo paths. Shared local `features/auth/destination.ts` blocks external/backslash/control-character/looping return URLs and enforces role routes in both sign-in/callback; 10 regression cases pass. Demo Patient and Doctor sign-in and 375/1440 layout verified. Actual Cognito callback requires configured live identity flow and was not exercised in mock mode. |
| 2026-10-22 | Codex | C3 Doctor Queue redesigned: actual urgency counts in glass chips, RED-first/oldest sorting, waiting/my-cases filters, spring layout updates, connected claim state and visible-only 20 s polling with last update. Verified populated mock case at 375/1440 and claim flow. Queue endpoint has no age/triage payload: show linked-triage context and read age in the case, avoiding invented ages or one request per row. |
| 2026-10-22 | Codex | C4 Doctor Case: responsive two-column conversation/triage-actions workspace (stacked in the same order on mobile), solid audit/forms, glass composer, claim/ownership/connection gating, visible-only polling and cached-data retention on poll errors. Text retry keeps its idempotency key; issued Rx/referral codes show neutral CodeCard and retry sharing with the same key, distinguishing code issuance from chat delivery. Mock claim, text reply, Rx/referral issue + chat sharing and close confirmation exercised; both widths checked. Voice components preserved; microphone/live S3 upload and actual clinical triage review were not exercised. |
| 2026-10-22 | Codex | C6 prescription/referral lookup: large code chip over landscape, neutral status, solid minimum-data detail card, code validation/retry and named referral destination with a truthful fallback. Checked successful demo Rx/referral lookups at 375/1440; no patient identifiers rendered. |
| 2026-10-22 | Codex | C7 How it works: public landscape/glass hero, expressive numbered steps, dark ground statement, practical offline/payment/account/household help and long advisory. Preserved `#help`; fee comes from existing configuration. Checked 375/1440 with no horizontal overflow. |
| 2026-10-22 | Codex | C8 About redesigned with the same public hero/cards/ground band; removed aspirational roadmap and invented contact channel, kept copy tied to actual features and shared-phone behaviour. Preserved `#providers`, `#privacy`, `#contact`; checked 375/1440 with no horizontal overflow. |
| 2026-10-22 | Codex | C9 NotFound/RouteError use new shared `design/components/RecoveryPanel.tsx`: neutral StatusMark, solid reading card and shared Home/Back/Retry buttons; removed unsupported assurances about saved-data safety and decorative urgency colour. NotFound and the real RouteError component checked at 375/1440; Back/Retry exercised. A temporary local HTML router fixture generated the error state and was removed after verification. |
| 2026-10-22 | Codex request | Profile/household writes cannot currently join the outbox (it supports triage/consultations/messages only, and household POST has no idempotency key). Retaining online-only writes with clear connection status; request a shared offline/idempotency design before promising offline profile edits. Existing frozen Notice/StatusMark use urgency backgrounds for non-clinical outcomes, and ChatBubble has off-scale type/radii; please reconcile during Claude's final shared-component QA. |
| 2026-10-22 | Claude | Picked up Codex's requests: neutral `Notice` / `StatusMark` for non-clinical outcomes and `ChatBubble` type/radius scale land in Claude's shared-component pass. **Batch 2 (§3b) handed to Codex**, with the API/config/routing layer for its duration. Claude is finishing Consult/Payment meanwhile. |
| 2026-10-23 | Claude | **How it works rebuilt as the reference public page** (`PublicHero` + `FeatureCard` + breakout + `StatementBand` + journey + FAQ). `PublicHero`'s breakout now sits in flow and overlaps only the card's reserved bottom padding (it used to cover the card's title). Checked in real Chrome at 375×812, 1280×620, 1536×730, 1440×900 and 1920×960: no overflow, and the primary action above the fold everywhere. |
| 2026-10-23 | Claude | **Owner rejected most undesigned pages (tacky, off-inspiration, no validation, wasted space). Batch 3 in §3c.** New shared building blocks: `AppPage` / `CardGrid` / `Panel` (full-width page layout with a sticky aside), `PublicHero` / `FeatureCard` / `StatementBand` (the inspiration's composition), `lib/form.ts` (`useForm` + rules), `Field` (`required`, `count`/`max`, invalid style), and `Toast` (`toast()` + `<Toaster />` in the Patient/Doctor/Public shells). The patient shell is wide by default, with a temporary `LEGACY_NARROW` list for Codex pages. Claude's pages reworked: Consult List (filters, search, at-a-glance aside), Consult Chat (thread + sticky case panel with a progress stepper and Call 15), Symptom check (desktop answers aside; inline validation instead of a dead button), Consult New and Payment (inline validation, phone normalisation, counters). Checked in real Chrome at 1536×730 and 375×812 with no overflow. The RED-result `EmergencyShare` wiring is now committed (your `EmergencyShare.tsx` landed in `fdf9afa`). |
| 2026-10-23 | Claude | **Batch 2 entry points.** Home has a flag-gated "More services" tile row (Appointments, Lab tests, Blood request, History) under Nearby facilities, signed-in only; committed. **`EmergencyShare` is wired into the RED result** (`TriageResult.tsx`: after Call 15 / Get directions, before facilities; passes `triage_result_id` only once the result has synced). That edit sits **uncommitted in the working tree** because it imports your uncommitted `EmergencyShare.tsx`. **Codex: commit `features/triage/TriageResult.tsx` in the same commit as `EmergencyShare.tsx`.** Checked in real Chrome at 1280×620, 1536×730, 1440×900, 1920×960 and 375×812 with no overflow. |
| 2026-10-23 | Claude | **Consult New/Chat/List and Payment done** and checked at 375 and 1440 (two-column desktop forms with sticky summary; opaque disabled primary buttons; neutral queue/offline states). Shared fixes from Codex's requests: `Notice` success/warn are neutral now (error keeps red as the one non-clinical exception); `ChatBubble` on type/radius tokens. **Glass and short desktops** after owner feedback: new Liquid Glass optics (low fill, sheen, rim, inner glow), stronger backdrop colour, height-aware display type, Landing hero padding by height, `fade-top` on the Landing landscape, NavRail scrolls on very short windows. Checked in real Chrome at 1280×620, 1536×730, 1440×900, 1920×960 and 375×812. **Codex: re-check your batch 1 and 2 pages at 1280×620 and 1536×730** (owner-reported issue). |
| 2026-10-22 | Codex handoff | All C1–C9 are implemented and pushed in page commits. Final checks: typecheck, ESLint, 26 tests (16 triage + 10 auth-destination cases), production/PWA build; 375×812 and 1440×900 layouts checked for all page families, including successful Rx/referral and a temporary RouteError fixture. Mock case closure persisted and disabled composer/forms on revisit. Live Cognito callback, push delivery, recording permissions/S3 upload and network-failure injection were not tested. Keep final end-to-end shared QA with Claude. Local preview remains available via `npm run dev:mock` on 5174. |

## 7. How to run, verify and hand back

```bash
cd Frontend
npm install
npm run dev:mock     # http://localhost:5174 — mock API + demo sign-in (Frontend/.env points at the real backend + Cognito)
npm run typecheck && npm run lint && npm test
```
- Verify **every page at 375×812, 1280×620, 1536×730, 1440×900 and 1920×960**: no horizontal scroll (`document.documentElement.scrollWidth === clientWidth`), nothing hidden behind the tab bar, primary actions above the fold at 1280×620, text readable on glass.
- Screenshots must come from a **real Chrome** at exact sizes, not only an emulated pane. Claude uses `playwright-core` (installed outside the repo) with `executablePath` pointing at the local Chrome, `deviceScaleFactor: 1`; sign in through the demo buttons on `/sign-in` first for app pages.
- For the doctor pages, sign in as the demo doctor on `/sign-in` in mock mode.
- Pull often: `git pull --rebase` before each commit. Commit per page: `feat(frontend): redesign <page>`. Push after each page so Claude sees it.
- When a page is done, tick it in §3 (add ✅) and log it in §6.


## 2026-10-31 — Current-main coverage and free maps (Codex)

At the owner’s request, audited main `b27d6e7` and connected every missing human-facing backend workflow. See [FRONTEND_BACKEND_COVERAGE.md](FRONTEND_BACKEND_COVERAGE.md) for the 73-route inventory, new pages, test evidence and live validation limits. See [MAPS.md](MAPS.md) for shared free street maps, optional Google Embed configuration and offline fallback. Existing patient/public/staff redesigns remain the visual reference. New regression suites cover onboarding privacy/decisions, S3 multipart POSTs, pool role isolation and free map URLs.
