# CareBridge Redesign: Design System and Screen Spec (v1.1)

> **Figma (editable source of truth):** https://www.figma.com/design/NitvyVWYfvQcGEUYBkqlbF — **CareBridge — Redesign v1.1**, in Bryan's team Drafts. Duplicated from the original view-only file `8Wm3ky7nyOCc8lF64w4539` on 2026-10-22; use the new file for all further work.
> Pages: `01 · Foundations` (tokens, type, icons, components), `02 · Mobile (390)` and `03 · Desktop (1440)`. Each screen sits in its own titled Section, ordered left to right by screen number.
> **Status:** The owner approved v1.1 and moved the redesign into code. The current build brief and ownership split are in `docs/REDESIGN_BUILD.md`. Claude's foundations/first screens and Codex C1–C9 pages are implemented; Claude's consult/payment work and final consistency QA remain. Existing Figma frames are visual references; use the approved code patterns for the additional pages.

---

## 1. Design direction

| Ingredient | What we take from it | Where it shows |
|---|---|---|
| **Current app palette** (`Frontend/src/index.css`) | Every colour. Brand greens, mint, cream, ink, and the urgency triad. **No new hues.** | Everywhere |
| **Reference shot** (architectural landing page) | Full-bleed landscape hero, oversized display type, a slash-framed tagline (`/ … /`), a floating rounded card over the scenery with chips, a dark "ground" band holding a tonal card + stats + uppercase statement + underlined link | Landing; header bands in the app |
| **Material 3 Expressive** | Bold display type scale, pill buttons, tonal containers, **asymmetric expressive corner shapes** (one corner tighter: `radius/2xl` + one `radius/md`), extended FAB, navigation rail with a pill active indicator, button groups, status steppers | Buttons, tiles, cards, rail |
| **iOS Liquid Glass** | Translucent, refractive surfaces for **navigation and floating controls only**: top bar, tab bar, nav rail, preview/hero cards over imagery, chips over imagery | Figma effect styles `Glass/Regular` and `Glass/Strong` (native GLASS effect) |

The landscape is **Mount Cameroon above Buea**, drawn as layered vector ridges in the brand greens. It ties the product to its place without stock photos (it is cheap to render and works offline).

---

## 2. Tokens (Figma variables and code)

All Figma fills, radii and gaps are **bound to variables**. In code these map 1:1 to Tailwind `@theme` tokens in `src/index.css`.

### Color: collection `CareBridge / Color`

| Token | Hex | Existing Tailwind token |
|---|---|---|
| `brand/900` | `#0b3d2c` | `brand-900` |
| `brand/800` | `#0d4a35` | `brand-800` |
| `brand/700` | `#0f5a3c` | `brand-700` (primary action) |
| `brand/600` | `#17704b` | `brand-600` |
| `brand/500` | `#2e8b5e` | `brand-500` (focus ring) |
| `surface/white` | `#ffffff` | `white` |
| `surface/cream` | `#f6f7f1` | `cream` (app background) |
| `surface/mint` | `#e4f1e8` | `mint` (tonal containers, active indicator) |
| `surface/mint-200` | `#cfe6d7` | `mint-200` |
| `border/line` | `#e3e8e4` | `line` |
| `text/primary` | `#0f1f17` | `ink-900` |
| `text/secondary` | `#4a5a52` | `ink-600` |
| `text/tertiary` | `#7b8a82` | `ink-400` |
| `text/on-brand` | `#ffffff` | `white` |
| `urgent/red` / `urgent/red-container` | `#c62828` / `#fdecea` | `urgent-red` / `urgent-red-50` |
| `urgent/amber` / `urgent/amber-container` / `urgent/amber-on` | `#e8a317` / `#fdf4e1` / `#7a5300` | `urgent-amber*` |
| `urgent/green` / `urgent/green-container` | `#2e7d32` / `#e8f3e9` | `urgent-green*` |
| `glass/tint` | `#ffffff` | **new**: used at 50% (regular) or 62% (strong) |
| `landscape/sky-top` | `#cfe6d7` | = mint-200 |
| `landscape/haze` | `#f3efe4` | **new**: illustration only |
| `landscape/far` | `#a9c7b6` | **new**: illustration only |
| `landscape/mid` | `#5f9478` | **new**: illustration only |
| `landscape/near` | `#2e6b4e` | **new**: illustration only |
| `landscape/ground` | `#0f3d2b` | **new**: dark "ground" sections |

### Shape and space: collection `CareBridge / Shape & Space`

- Radius: `sm 12 · md 16 · lg 24 · xl 32 · 2xl 40 · full 999`. **Expressive shape** = three corners `2xl`, one corner `md` (or `sm` for chat bubbles). The tight corner points toward the content's origin (for example, bottom-left on hero cards).
- Space: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56`. No other values.
- Touch targets ≥ 48px (buttons are 56 large / 44 medium; icon buttons are 48).

### Type: text styles (Plus Jakarta Sans for display, Inter for UI)

| Style | Font | Size/Line | Use |
|---|---|---|---|
| Display/XL | Jakarta ExtraBold | 96/96, −4% | Desktop landing hero only |
| Display/L | Jakarta ExtraBold | 64/68, −3% | Desktop result hero |
| Display/M | Jakarta ExtraBold | 44/48, −2.5% | Mobile heroes, desktop statements |
| Headline/L·M·S | Jakarta Bold | 32/38 · 26/32 · 22/28 | Card titles, section headers (S) |
| Title/L | Jakarta SemiBold | 18/24 | Card titles, app bars |
| Title/M | Inter SemiBold | 16/22 | List titles, large button labels |
| Body/L·M | Inter Regular | 16/24 · 14/20 | Copy |
| Label/L·M | Inter SemiBold | 14/20 · 12/16 | Buttons (medium), chips, meta |
| Eyebrow | Inter Bold | 12/16, +14%, UPPERCASE | Section kickers |

### Effects

- `Glass/Regular`: native GLASS (light 0.55, refraction 0.3, depth 14, dispersion 0.15, frost 10) + shadow 0/10/30 at 10%.
- `Glass/Strong`: GLASS (light 0.7, refraction 0.45, depth 20, dispersion 0.15, frost 18) + shadow 0/14/40 at 14%.
- Both glass styles: light angle −45°, subtle white inner rim (0/1/1 at 60%), white inside stroke at 80%, 1px. Regular fill = `glass/tint` at 50%; Strong = 62%. Bind the colour **and** set its fallback to white: the unfinished v1 used black fallback colours on several white-token-bound fills. Audit instance overrides too. Native GLASS parameters cannot be variable-bound through the Figma API.
- `Elevation/1` (0/2/8 at 6%) and `Elevation/2` (0/12/32 at 10%).
- **Glass recipe in code:** `bg-white/50` (or `/60` strong) + `backdrop-blur-xl` + `border border-white/80` + the matching shadow. Respect `prefers-reduced-transparency`: fall back to `bg-white/95`.

---

## 3. Components (Figma: Foundations → Components)

| Component | Variants / props | Rules |
|---|---|---|
| **Button** | Style = Filled · Tonal · Glass · Danger · Outline; Size = Large (56) · Medium (44); props Label, Show icon, Icon | Pill. **One Filled per view.** Glass only over imagery or tinted backgrounds. **Danger only for emergency actions (call 15).** Leading icon. |
| **IconButton** | Style = Glass · Tonal · Filled · Danger; Icon | 48px circle |
| **Chip** | State = Default · Selected; Label | Selected = `brand/900` |
| **UrgencyBadge** | Level = RED · AMBER · GREEN; Label | The only place urgency colours appear (plus urgency heroes/dots) |
| **FacilityRow** | Name, Meta, Distance, Icon | Capability tile, name, a distance pill plus a one-line meta, and a tonal call button (`tel:`) |
| **NavItem** | State = Active · Default; Label, Icon | Active = mint pill indicator |
| **NavRail/Patient** | – | Desktop (≥1024) patient shell: logo, extended FAB "New consultation", the same 5 destinations as mobile (Home · Triage · Consults · Facilities · Profile), sync/account controls at the bottom. Household lives under Profile. Liquid Glass Strong. |
| **TabBar/Patient** | Active = Home · Triage (current screens); set `2004:162`, variants `2004:118` / `2004:148` | Shared Strong glass mobile shell: 358×72 at 390 width, 5 tabs, 16px from the sides and 32px from the bottom. Both current app screens use instances; reserve content space above the bar. |
| **StatusBar/iOS**, **Logo/CareBridge**, **Icon/*** (34 lucide icons) | – | Icons are the same lucide set the app already uses |

---

## 4. Screens in v1

| # | Screen | Route | Mobile (390) | Desktop (1440) | Backend used |
|---|---|---|---|---|---|
| 01 | Landing (public) | `/` | `2:46` | `4:376` | static; facility count from the seed |
| 02 | Patient Home | `/app` | `2:162` | `4:509` | `GET /profile`, `GET /consultations`, `GET /facilities`, `GET /doctors/available`, `GET /health-tips` |
| 03 | Triage Result, RED example | `/app/triage/:resultId` | `2:395` | `4:794` | `POST /triage` result (`urgency`, `rules_fired`, `facility_type_needed`), facilities filtered by `emergency` |

Shell rules shown in these screens:
- **Mobile app:** iOS-style status bar, then a content app bar, then content, then the **floating Liquid Glass tab bar** (Home · Triage · Consults · Facilities · Profile).
- **Desktop app:** the **NavRail** on the left (264px), and main content with 40px side padding. Reflow into columns when appropriate while preserving the mobile content order. Doctor Case uses a flexible conversation column and a narrower triage/actions column.
- **Public pages:** a glass pill nav (desktop) or glass top bar (mobile) over the landscape hero, then the dark "ground" band.
- **RED result:** the whole page tints to `urgent/red-container`. The first action is **Call 15** (Danger), then directions, then the nearest emergency facility. "Ask a doctor" comes **last**, as an Outline button. The advisory disclaimer is always visible.

---

## 5. Consistency rules (non-negotiable)

1. **Use only the tokens above.** No raw hex, no off-scale spacing or radii. If a value is missing, add it to the token set (Figma + `index.css`) first and record it here.
2. **Use only the components above.** Do not hand-build a button, chip, badge, facility row or nav item. Missing component? Add it to Foundations (Figma) **and** `src/design/components`, then use it.
3. **Glass is for chrome and floating surfaces**, never for dense reading content (lists, forms, chat threads sit on solid white/cream).
4. **Urgency colours are clinical signals.** Never decorative, never for brand accents, never for errors unrelated to triage (form errors use `urgent/red` text only, with an icon).
5. **The same destination keeps the same name, icon and order** in the TabBar and the NavRail.
6. **Same screen, same structure across breakpoints.** Desktop re-flows the mobile order into columns; it never adds or drops content. Section order: hero → primary actions → status/context → lists → tips.
7. **Every screen must map to an existing backend capability** (`docs/BACKEND_FEATURE_MAP.md`). No invented features, numbers or claims.
8. **Offline is a first-class state.** Every screen that writes shows the sync chip ("Synced · 2 min ago" / "Saved on this phone · syncs when online").
9. **Copy voice:** short, plain, second person. Assume the reader is anxious and on a slow phone. Always leave room for French (about 30% longer) and Pidgin.
10. **Accessibility:** contrast ≥ 4.5:1 for body text (white on `urgent/red`, `brand/700` and `landscape/ground` all pass), targets ≥ 48px, honour `prefers-reduced-motion` and `prefers-reduced-transparency`.

---

## 6. v1.1 refinement and continuation notes (2026-10-22)

- Refined the existing six frames and shared glass styles/components; no new screen batch or frontend/backend code changes.
- Mobile Landing: hero `2:48` is 900px high instead of 1050px. New vertical auto-layout wrapper `2005:346` keeps the existing top bar, copy/actions and preview together, with token-based 24px gaps. The CTA-to-preview gap was 170px. The landscape now covers the complete hero continuously. Body copy uses `text/primary` at both breakpoints because secondary text over the far ridge measured about 4.01:1, below the body-text target.
- Corrected glass fills and inside strokes on the Button/Glass, IconButton/Glass and NavRail masters, floating hero/navigation/chip surfaces, and affected instances. Dense stats now use solid `brand/800`; consultation/facility/rule/health-tip cards retain solid backgrounds.
- Softened existing ambient backdrop ellipses (Brand 12%, Red 8%) and allowed blurred edges to extend, avoiding saturated fields and hard seams behind the reading content. Desktop Home's glass hero now has 24px top/bottom padding and enough header height.
- Shared mobile navigation instances: Home `2005:347`, RED Result `2005:376`. The RED page retains Call 15 → directions → nearest facility, advisory text and doctor action; navigation sits after clear content space.
- Final screenshot review covered all six frames plus Button, NavRail and both TabBar variants. Structural inspection confirmed editable text/vector/component UI with Inter and Plus Jakarta Sans; only the existing logo is image-filled. No whole-screen raster replacements. New screen heights are recorded in `AGENTS.md` §6.
- Navigation was subsequently resolved in code by Claude to 5 matching destinations named Home · Triage · Consults · Facilities · Profile. Continue from `docs/REDESIGN_BUILD.md`; the older frame differences above are historical. Example names, counts, prices and response times must come from actual app data/configuration.
