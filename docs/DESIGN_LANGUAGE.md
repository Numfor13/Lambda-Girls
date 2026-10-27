# CareBridge design language v2: "Clinical editorial"

Written 2026-10-23 by Claude Code after the owner said the pages looked generic. This replaces
the visual rules of `DESIGN_SYSTEM.md` v1 (Liquid Glass everywhere + M3 Expressive shapes). The
**colours are unchanged**; type, shape, elevation, glass and motion are new. The tokens live in
`Frontend/src/index.css`, so most of this is already applied to every page.

## 1. Where it comes from

We captured 31 reference sites in real Chrome (desktop 1440 and phone 390) and read their
computed CSS (fonts, sizes, radii, shadows, easing, widths). Six were blocked by bot checks
(Zocdoc, K Health, Carbon Health, Helium Health, Ro, Cash App); we did not try to get around them.

| Group | Studied | What we took |
|---|---|---|
| Design leaders | Apple, Stripe, Linear, Vercel, Airbnb, Notion, Figma, Framer, Headspace, Duolingo, Monzo, Revolut, Arc, Raycast, Mercury, Wise, Superhuman, Things, Material 3 site, Pitch | Display weights of 300–540, not 800. Cards at 8–24px radius, with pills only for buttons and chips. Hairline + layered shadows (Airbnb, Notion). 150–300ms colour transitions and no bounce (Apple, Linear, Stripe). Real product UI as illustration (Stripe, Headspace bento). Glass only on the nav (Apple: blur 20px, saturate 180%). A working tool in the hero (Wise calculator, Airbnb search). Segmented search bar (Airbnb). |
| Health and care | One Medical, Oscar, Ada, Doctolib, NHS 111, Kry/Livi, Practo, Teladoc, Maven, NHS App, mPharma | Editorial **serif display** (One Medical's GT Super, Oscar, Ada's PT Serif, Teladoc's Reckless, Maven) with an *italic accent phrase* in the brand green. Deep-green and mint palettes (One Medical is almost ours). NHS 111's "I want to get…" option list as the entry point. Practo's service entry tiles. Plain, reassuring copy with facts instead of claims. |

## 2. Principles

1. **One strong moment per screen.** One dark (`brand-900`/`ground`) or one red (emergency) block; everything else sits on cream and white.
2. **Serif for voice, sans for work.** Fraunces is for display and headlines (the warmth). Inter is for everything people read or act on.
3. **Show the product, never stock.** Illustrate with real UI fragments built from our components, labelled "Example" when they show sample data.
4. **Function first.** The first screen does something: Landing opens with "What do you need right now?", Home with the danger-sign check, Facilities with search.
5. **Calm motion.** Things settle; they don't bounce. Hover changes colour, and a press scales to 0.97.
6. **Density with air.** Rows carry real metadata (hours, distance, services, power), cards stay at 14–24px radius, and sections get 64–112px of vertical rhythm.

## 3. Tokens (all in `index.css`)

- **Type**:
  - `text-display-xl/l/m` and `text-headline-l/m` are **Fraunces**, weight 420–480, line height 0.98–1.06, tracking −0.016 to −0.028em.
  - `text-headline-s` and smaller are **Inter**.
  - For an accent phrase, use `<em className="accent">…</em>` inside a serif heading. Use it once per heading at most.
  - New `text-code` (system mono, tabular) for Rx/referral codes, coordinates and receipt numbers. Use `tabular` for counts.
- **Radius**:
  - `sm` 10, `md` 14, `lg` 18, `xl` 24, `2xl` 32.
  - Cards are `rounded-lg` or `rounded-xl`. Hero panels are `rounded-2xl`. Buttons and chips are `rounded-full`.
  - `shape-bl/br/tl/tr` now resolve to a uniform `xl`. **Don't use them in new code.**
- **Elevation**:
  - `--shadow-elev-1` is a hairline plus a soft shadow, for every card.
  - `--shadow-elev-2` is for hover and raised surfaces.
  - `--shadow-float` is for one floating panel per page.
  - Don't add borders on top of these.
- **Glass**:
  - `glass` and `glass-strong` are crisp (white 66–78%, blur 16–24px, saturate 180%, hairline).
  - Use them **only** for the public nav, mobile top bar, tab bar, toasts, the sticky composer and the wizard footer.
  - Never use glass on cards, forms, lists or info panels.
- **Motion**:
  - `SPRING.*` are critically damped; `bouncy` overshoots only slightly.
  - No `borderRadius` morphs, no `whileHover` scale, no rotating icons.
  - Entrances rise 8–20px.
- **Ground**:
  - `Backdrop` is a still cream with a faint brand glow (no drifting blobs).
  - Urgency tones only tint the glow.
- **Logo**: the mark plus a live serif wordmark (`<Logo light />` on dark).

## 4. Component rules

- **Button**: heights 40/48/52. `primary` has a subtle inner highlight. `secondary` is white with an ink hairline. Use `tonal` (mint) for secondary actions on cards. Use `glass` only over imagery.
- **Field**: 1px ink/15 border with a 4px focus ring. Validation stays inline (see `lib/form.ts`).
- **ChoiceCard / symptom rows**: white card; selected = mint fill + 2px inset brand ring + check.
- **Chip**: 40px (a thumb-sized target on phones). Unselected is white with a hairline; selected is `brand-900` with a check.
- **FacilityRow**:
  - Capability tile (dark for emergency), then the name (2 lines on mobile), then quarter · hours · distance.
  - Then up to 3 service tags + "+N", then backup power.
  - The whole row is a link, with a separate call button.
- **Sidebar (NavRail)**: flush, white/75 with blur, a hairline right edge. 40px rows with a mint active state, plus a "Menu" label.
- **Stepper**: vertical, numbered, with the answer under each finished step (see `TriageWizard` aside).
- **Segmented progress**: one segment per step, plus "Step n of N".

## 4b. Lively components and laptop screens (added 2026-10-27)

From a second study (~400 Dribbble shots across 54 page-type queries, plus NHS 111, GOV.UK patterns,
Practo, Doctolib, Airbnb, Magic UI, Motion): motion should **show real state changing**, not decorate.

- `design/components/Lively.tsx`:
  - `NumberTicker`: counts up to a real number once, on first view.
  - `ProgressRing`: a circular sweep.
  - `PulseDot`: live or waiting status (online doctors, queued case, lab in progress).
  - `AvatarStack`.
  - `PulseLine`: a heartbeat trace that draws once in Home's dark hero.
  - `StepTrack`: a short horizontal progress bar (consults, labs, visits).
  - `Skeleton`: a content-shaped loading block with a light sweep, used instead of spinners in lists.
- `FacilityMap`: an offline schematic built from the saved coordinates only, with no tiles and no invented streets. On desktop it sits beside the directory and follows the hovered row; phones get a List | Map toggle.
- `FacilityPicker`: a searchable radio list (icon, quarter, hours, distance). `prefer` floats the right services to the top. Use it instead of a `<select>` of 40 facilities.
- **Laptop height.** A 1080p laptop at 125% or 150% scaling gives the browser about 1536×730 or 1280×620:
  - `@custom-variant short` (desktop width, ≤800px tall) tightens vertical rhythm: `short:pt-5`, `short:min-h-12` and so on.
  - `text-display-m` also scales with `svh`.
  - The `AppPage` aside is 300px until `xl`.
  - Toolbars that must fit a column use container queries (`@container` + `@2xl:`), not viewport breakpoints.
- Search, sort and filter controls appear only when a list is long enough to need them (more than about 5 items).

## 5. Page patterns (reference implementations)

| Pattern | Reference file |
|---|---|
| Public landing: serif hero, a working option panel, a landscape band running into the dark facts strip, a bento of UI vignettes, a dark safety band | `features/landing/Landing.tsx` |
| App home: greeting with accent name, one dark hero, a full-width action row, main + aside | `features/home/PatientHome.tsx` |
| Directory: segmented search bar, chips, auto-fill rows, aside with real counts by service | `features/facilities/FacilityList.tsx` |
| Detail/profile: editorial header (tile, serif name, status chips, actions on the right), main + sticky aside | `features/facilities/FacilityDetail.tsx` |
| Wizard: segmented progress, NHS-style options, sticky glass footer ("Next: …"), stepper aside, check-answers with Change links | `features/triage/TriageWizard.tsx` |
| Care timeline: everything in progress as cards with a status dot and a `StepTrack` | `features/home/PatientHome.tsx` (Your care) |
| Inbox list: status + time, two-line title, inline primary action (Pay) | `features/consult/ConsultList.tsx` |
| Request form + record list: form main, records aside (records first on phones when they exist) | `features/services/Appointments.tsx`, `Labs.tsx` |
| Activity feed: tabs, day groups, one card per day, ticket-style receipt | `features/services/History.tsx` |
| Public content page: `PublicIntro` (serif headline + a *working* product fragment), then `PublicSection`s; one dark section at most | `features/public/HowItWorks.tsx`, `About.tsx` |
| Split sign-in: form half + a dark preview half that follows the chosen role | `features/auth/SignIn.tsx` |
| Public tool page: header + the tool first, help in the aside (no hero) | `features/services/HealthTips.tsx`, `features/anonymous/AnonymousAsk.tsx`, `features/public/CodeLookup.tsx` |
| Code entry: one real input over 8 visible boxes; the answer as a ticket | `features/public/CodeLookup.tsx` |
| Not found / error: `RecoveryScene` (signpost picture, one sentence, one way back, three familiar places) | `design/components/RecoveryScene.tsx` |

## 6. Don'ts

- Don't use 800-weight headings, tight black sans display, or `font-display` on body text.
- Don't use asymmetric corners, `whileHover={{ scale }}`, rotation or wobble animations, or drifting blobs.
- Don't put glass on a reading surface, or a dashed border on an empty state (use a white card with a mint icon).
- Don't use urgency red, amber or green for decoration (backup power uses `brand-600`, not amber).
- Don't invent numbers. Every figure comes from data or config, and sample UI says "Example".
