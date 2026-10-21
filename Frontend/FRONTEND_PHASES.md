# Health Track — Frontend Build Phases
> React + Vite + TypeScript + shadcn/ui + TailwindCSS · Progressive Web App

---

## Stack

| Concern | Choice |
|---|---|
| Framework | React 18, TypeScript, Vite |
| UI components | shadcn/ui + TailwindCSS |
| Routing | React Router v6 |
| State | Zustand (global) + React Query (server state) |
| Offline storage | Dexie.js (IndexedDB wrapper) |
| PWA | vite-plugin-pwa (Workbox) |
| Maps | Leaflet + react-leaflet (OpenStreetMap, no API key) |
| Auth | Amazon Cognito Hosted UI (redirect-based) |
| i18n | react-i18next |
| Voice recording | MediaRecorder API (Opus codec) |

---

## Feature Groups

1. **PWA shell & offline infrastructure** — service worker, install banner, offline write queue
2. **Facility directory** — offline list, distance sorting, one-tap call, detail page
3. **Triage flow** — 40-symptom wizard, age-banded rules, red/amber/green result, rule audit
4. **Auth & patient profile** — Cognito Hosted UI, on-behalf household members
5. **Consultation & messaging** — async text chat, voice note recorder/player, doctor view
6. **Payment** — Fapshi gate, receipts, pay-for-someone-else
7. **Push notifications & history** — web push permission, consultation timeline
8. **Extended services** — map view, appointments, lab tests, blood requests, emergency share
9. **Operator console & multi-channel** — operator dashboard, available doctors, anonymous mode
10. **i18n & accessibility** — EN/FR/Pidgin strings, screen reader, low-end device tuning

---

## Phase 1 — PWA Shell & Offline Infrastructure

**Goal:** Installable app that opens with no network, queues writes locally, and syncs when connectivity returns.

### Tasks

- [ ] Install and configure `vite-plugin-pwa`:
  - `manifest.json`: `display: standalone`, `start_url: /`, name "Health Track", `background_color`, `theme_color`
  - Icons at 192 px and 512 px (SVG source → PNG pipeline)
  - Service worker strategy: cache-first for facility list and static assets; network-first for API calls with offline fallback to cached response
- [ ] App shell layout:
  - `<AppShell>` component: persistent bottom navigation, top app bar
  - Bottom nav tabs: Home, Facilities, Triage, Consultations, Profile
  - Route setup in `App.tsx` using React Router `<Routes>`
- [ ] Offline state detection:
  - `useNetworkStatus` hook (`navigator.onLine` + `online`/`offline` events)
  - Persistent banner: "You are offline — changes will sync when you reconnect"
- [ ] Offline write queue (Dexie.js):
  - `db.ts` — Dexie database schema: `offline_queue` table (`id`, `type`, `payload`, `queued_at`, `retries`)
  - `useOfflineQueue` hook: enqueue, dequeue, process-on-reconnect
  - On reconnect: iterate queue, call `POST /sync`, remove successfully processed items
- [ ] Feature flag system:
  - `features.ts` — boolean flags for each Tier 2 feature
  - `<FeatureGate feature="..." />` wrapper component that renders `null` when flag is off
  - Flags read from `import.meta.env` so they can be set per build without a deploy
- [ ] Loading skeleton and error boundary components
- [ ] Unit tests: `useOfflineQueue` enqueue/dequeue, `useNetworkStatus` state transitions

### Outputs
- App installs to home screen on Android
- Opens and renders shell with no network
- Offline queue persists across page reloads

---

## Phase 2 — Facility Directory

**Goal:** Offline-capable facility list with distance sorting, searchable by capability, and one-tap call.

### Tasks

- [ ] **Data loading**:
  - On first install (service worker `install` event), prefetch `GET /facilities` and cache in Workbox `CacheFirst` strategy
  - React Query key `['facilities']` reads from cache; falls back to Dexie `facilities` table if API unreachable
  - Background refresh every 24 hours when online
- [ ] **Facility list page** (`/facilities`):
  - `<FacilityCard>` component: name, distance badge, top 2 capabilities as chips, phone, CSU card indicator
  - Distance computed client-side: Haversine formula from device GPS position to `{ latitude, longitude }` of each facility
  - `useGeolocation` hook: requests permission once, caches position in `localStorage`; shows "Sorting by distance" badge when active
  - Sort: nearest first; ties broken by name
  - Filter bar: capability chips (Emergency, Maternity, Laboratory, Pharmacy, Blood bank, X-ray), backup power toggle, CSU card toggle
  - Empty state: "No facilities match your filters"
- [ ] **Facility detail page** (`/facilities/:id`):
  - Name, full address, opening hours table
  - Capabilities displayed as labelled icons
  - "Backup power: Yes/No", "Accepts CSU card: Yes/No"
  - Indicative consultation fee in XAF
  - One-tap call button: `<a href="tel:{phone}">` — renders as a native call on mobile, works offline, no API
  - Distance and directions note (static map pin placeholder for Phase 8)
- [ ] **Search**: fuzzy search over name and quarter using `fuzzysort` (already in `node_modules`)
- [ ] Unit tests: Haversine distance calculation, filter logic, facility card rendering

### Outputs
- Facility list opens with no network
- Distance sorting active when geolocation permitted
- One-tap call works offline

---

## Phase 3 — Triage Flow

**Goal:** Multi-step symptom wizard running entirely in the browser, red/amber/green result, auditable rule log.

### Tasks

- [ ] **Triage rule engine (browser)**:
  - Port the triage rule JSON from the backend (`child_under_5`, `obstetric`, `adult_red_flags`) into a `src/lib/triage/` directory
  - `evaluateSymptoms(payload: TriagePayload): TriageResult` — pure function, no API call; this is the offline-capable version
  - `TriagePayload`: `{ age_months: number | null, is_pregnant: boolean, symptoms: string[], vitals: { resp_rate?: number } }`
  - `TriageResult`: `{ urgency: "RED" | "AMBER" | "GREEN", recommendation: string, facility_type_needed: string, rules_fired: RuleFired[] }`
- [ ] **Symptom wizard** (`/triage`):
  - Step 1: "Who are we checking?" — self or a household member (loads profile members)
  - Step 2: Age input (years + months); pregnancy flag if applicable
  - Steps 3–N: symptom groups presented one screen at a time (general, respiratory, obstetric, etc.); 40 symptoms total across groups
  - Progress indicator (step X of N)
  - Back navigation without losing answers
  - Answers stored in React state (not persisted until submission)
- [ ] **Result screen**:
  - Large colour-coded urgency badge (red / amber / green with accessible text contrast)
  - Plain-language recommendation
  - Facility type needed
  - "Call a facility" shortcut → pre-filtered facility list
  - Collapsible "Why was this flagged?" accordion listing each `RuleFired`
- [ ] **Submission**:
  - When online: `POST /triage` with payload; store `result_id` returned
  - When offline: enqueue in offline write queue; result stored in Dexie for immediate display
  - Confirmation: "Your triage result has been saved. It will sync when you reconnect."
- [ ] Unit tests: `evaluateSymptoms` for each rule group, age-boundary cases, wizard navigation

### Outputs
- Triage wizard runs fully offline
- Results display immediately regardless of network
- Offline results sync automatically on reconnect

---

## Phase 4 — Auth & Patient Profile

**Goal:** Cognito Hosted UI integration, patient profile editing, household member management.

### Tasks

- [ ] **Auth integration**:
  - `src/lib/auth.ts`: PKCE flow using `pkce-challenge` (in `node_modules`); stores `code_verifier` in `sessionStorage`
  - `<AuthProvider>` context: holds `{ user, tokens, isLoading, signIn, signOut }`
  - `signIn()` redirects to Cognito Hosted UI with `response_type=code`
  - Callback route (`/auth/callback`): exchanges code for tokens; stores `access_token` + `refresh_token` in memory + `localStorage`
  - Token refresh: silent refresh 5 minutes before expiry using `setTimeout`
  - `<ProtectedRoute>` wrapper: redirects to sign-in if no valid token
- [ ] **Sign-in page** (`/sign-in`): landing page with app tagline, "Sign in / Create account" button → Cognito redirect
- [ ] **Patient profile page** (`/profile`):
  - Display name, phone (read-only after signup), locale selector
  - Edit form with optimistic update
  - `PUT /profile` on save
- [ ] **Household members section** (on `/profile`):
  - List of on-behalf profiles
  - "Add household member" drawer: name, date of birth, sex, relationship
  - `POST /profile/household` on add; `DELETE /profile/household/{member_id}` on remove
  - Member cards used in triage wizard (Phase 3) and consultation creation (Phase 5)
- [ ] **Sign-out**: clear tokens, redirect to `/sign-in`
- [ ] Unit tests: token refresh timing, protected route redirect, household member add/remove

### Outputs
- Full auth flow (sign up, sign in, sign out, token refresh)
- Profile and household member management

---

## Phase 5 — Consultation & Messaging

**Goal:** Async text chat, voice note recording (offline-capable), doctor case view, on-behalf support.

### Tasks

- [ ] **New consultation flow** (`/consultations/new`):
  - Select: self or household member
  - Complaint text area (required)
  - Link most recent triage result (optional, pre-populated if triage just completed)
  - Submit → `POST /consultations` → lands on payment gate (Phase 6)
- [ ] **Consultation list** (`/consultations`):
  - Patient view: own + on-behalf consultations, sorted by `updated_at`
  - Status chip: Pending Payment / Awaiting Doctor / In Progress / Closed
  - Urgency indicator on red/amber cases
- [ ] **Consultation detail / chat** (`/consultations/:id`):
  - Message thread (patient + doctor messages, timestamped)
  - Bubble style: patient right, doctor left
  - Text input bar with send button
  - Send `POST /consultations/{id}/messages` with `client_message_id` (UUID generated once, stored in `localStorage` keyed by draft)
  - When offline: enqueue in offline write queue; show optimistic message with "pending" indicator
- [ ] **Voice note recorder**:
  - Hold-to-record button (uses `MediaRecorder` with `audio/webm;codecs=opus`)
  - Duration displayed in real time (max 30 seconds enforced client-side)
  - On release: compress (browser-native Opus is already small, ~80 KB / 30 s), preview playback, "Send" / "Discard"
  - Send: fetch presigned URL (`POST /consultations/{id}/voice-note-upload-url`), `PUT` to S3, then `POST /consultations/{id}/messages` with `content_type: "voice_note"`
  - Offline recording: blob stored in Dexie; upload queued; `POST /messages` queued as dependent on upload
- [ ] **Voice note player**:
  - Inline waveform bar (static SVG, not live) with play/pause, timestamp
  - Fetches presigned GET URL on play (`GET /consultations/{id}/voice-note/{message_id}`)
- [ ] **Doctor view** (`/doctor/queue`):
  - List of paid + open cases, RED cases first
  - Case card: urgency badge, complaint excerpt, triage urgency, time since created
  - Case detail: full complaint, triage result + rules-fired accordion, message thread
  - Claim case button, Reply (text + voice), Close case button
  - Issue Prescription / Issue Referral drawers (Phase 6 endpoints)
- [ ] React Query polling: consultation detail polls every 10 s when page is focused and status is `open`
- [ ] Unit tests: voice recorder duration cap, message idempotency key, offline voice queue ordering

### Outputs
- Text + voice consultation flow end-to-end (online)
- Voice notes record offline and upload on reconnect
- Doctor queue and case detail working

---

## Phase 6 — Payment

**Goal:** Fapshi payment gate before consultation enters doctor queue; receipts; pay-for-someone-else.

### Tasks

- [ ] **Payment gate screen** (`/consultations/:id/pay`):
  - Triggered automatically after consultation created (status = `pending_payment`)
  - Shows: consultation summary, amount in XAF, "Pay Now" button
  - "Pay for someone else" toggle: shows additional name/phone field (for relative abroad)
  - "Pay Now" → `POST /payments/initiate` → redirect to Fapshi payment URL returned
- [ ] **Payment callback page** (`/payments/callback`):
  - Fapshi redirects here after payment
  - Poll `GET /payments/{payment_id}` every 2 s until `status = confirmed` (max 30 s, then show "checking…" state)
  - On confirmed: navigate to consultation detail with success toast
  - On failure / timeout: show retry option
- [ ] **Payment history page** (`/payments`):
  - List of payments with date, amount, consultation link, status chip
  - `GET /payments`
- [ ] **Receipt view** (`/payments/:id`):
  - Fapshi reference, amount, date, payer, consultation link
  - "Download receipt" — browser print dialog (`window.print()`)
- [ ] **Pay-for-someone-else banner**: shown in consultation detail when `payer_id ≠ patient_id`
- [ ] Unit tests: polling timeout handling, pay-for-someone-else field validation

### Outputs
- No consultation reaches doctor queue without payment
- Receipts viewable and printable
- Pay-for-someone-else flow complete

---

## Phase 7 — Push Notifications & Consultation History

**Goal:** Web push permission flow, notification on doctor reply, full consultation history timeline.

### Tasks

- [ ] **Push notification setup**:
  - `usePushNotifications` hook:
    - `GET /push/vapid-public-key` → fetch VAPID public key
    - `Notification.requestPermission()` after user gesture
    - `serviceWorker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`
    - `POST /push/subscribe` with subscription JSON
  - Permission request prompt: shown on consultation detail page after payment confirmed (not on app load — avoid permission fatigue)
  - Service worker `push` event handler: `self.registration.showNotification(...)` with title + body
  - Notification click → navigate to consultation detail
- [ ] **Notification preference** in Profile page: toggle on/off, unsubscribes via `DELETE /push/subscribe`
- [ ] **Consultation history timeline** (`/history`):
  - Unified timeline: consultations, triage results, prescriptions, referrals — sorted by date
  - `GET /consultations` + `GET /triage` combined and sorted client-side
  - Timeline card types: Triage (urgency badge), Consultation (status + doctor name), Prescription (code + medication), Referral (facility name + code)
  - Tap a prescription or referral → detail view with code display (large, copyable)
- [ ] **Available doctors list** (`/doctors`):
  - `GET /doctors/available` — list online doctors
  - Doctor card: specialty, typical response time
  - No distance shown (irrelevant for text consultation)
- [ ] Unit tests: push subscription lifecycle, timeline sort, notification click routing

### Outputs
- Push notifications arrive when doctor replies
- Full history timeline visible
- Available doctors page live

---

## Phase 8 — Extended Services

**Goal:** Map view, appointment booking, lab test request, blood request, emergency location share.

### Tasks

- [ ] **Map view** (`/map`):
  - Leaflet + react-leaflet + OpenStreetMap tiles (no API key, no billing)
  - Facility markers with popup: name, distance, one-tap call link
  - User location marker (if geolocation permitted)
  - Filter by capability (same chips as list view)
  - Offline fallback: if tile fetch fails, display offline facility list view with a "Map unavailable offline" banner
  - Feature-flagged: `features.mapView`
- [ ] **Appointment booking** (`/appointments`):
  - List page: upcoming appointments with status chips
  - New appointment form: facility picker, date, slot (morning/afternoon/evening), optional note
  - `POST /appointments` on submit
  - Feature-flagged: `features.appointmentBooking`
- [ ] **Lab test request** (`/lab-tests`):
  - Form: test type picker, facility or home collection address
  - Status timeline: Requested → Sample collected → Results ready → Delivered
  - `POST /lab-requests`, `GET /lab-requests/:id`
  - Feature-flagged: `features.labTests`
- [ ] **Blood request** (`/blood-request`):
  - Filter facilities showing "blood bank" capability
  - Form: blood type, units needed, urgency
  - `POST /blood-requests`
  - Feature-flagged: `features.bloodRequests`
- [ ] **Emergency location share** button (persistent in triage result screen + home):
  - Single large button: "Send my location to emergency staff"
  - Geolocation required; if denied show instructions
  - `POST /emergency` with lat/lon + most recent triage result ID
  - Confirmation screen with "Help is notified" message
  - Feature-flagged: `features.emergencyShare`
- [ ] Unit tests: Leaflet tile offline fallback, appointment slot validation, emergency geolocation error handling

### Outputs
- Map view with offline fallback
- Appointment, lab, blood, emergency flows complete (behind feature flags)

---

## Phase 9 — Operator Console & Anonymous Mode

**Goal:** Operator-only console, anonymous question flow, available-doctors discovery.

### Tasks

- [ ] **Operator console** (`/operator`):
  - Route guarded by `Operator` Cognito group check in JWT claims
  - **Callback queue tab**: pending nurse callbacks sorted by urgency; "Handle" button opens note drawer; `PUT /operator/callbacks/:id/handle`
  - **Facility search tab**: search by capability + quarter; results show name, phone, capabilities; one-tap call
  - **Dispatch log tab**: `POST /operator/dispatch-log`; list of today's dispatches
  - **Emergencies tab**: live list from `GET /operator/emergencies`; each shows urgency badge + coordinates + triage summary
  - React Query polling every 15 s on all operator tabs
- [ ] **Anonymous question mode**:
  - Entry via a "Ask anonymously" link on the sign-in page (no login required)
  - Generates a UUID session token, stores in `localStorage`
  - Creates consultation using `X-Anonymous-Session` header (no Cognito token)
  - Payment flow proceeds normally (Fapshi does not need identity)
  - Consultation access: only from the same browser with the same token
  - Clear session button: "Forget this session" → removes token and local state
  - Feature-flagged: `features.anonymousMode`
- [ ] **Health tips feed** (`/health-tips`):
  - Curated cards: title, body excerpt, source, published date
  - Filter by locale
  - Each tip must show source name and date (enforced by display — tips without these are filtered out client-side as a guard)
  - `GET /health-tips`
- [ ] Unit tests: operator group guard, anonymous session creation and access, tips source validation guard

### Outputs
- Operator console with callback queue, dispatch log, emergencies
- Anonymous consultation mode working
- Health tips feed with source attribution enforced

---

## Phase 10 — i18n, Accessibility & Performance

**Goal:** EN/FR/Pidgin strings, accessibility audit, low-end device performance pass.

### Tasks

- [ ] **react-i18next setup**:
  - Load locale JSON from `GET /i18n/{locale}` on app start; fallback to bundled `en.json`
  - Language selector in Profile page and on triage/USSD screens (highest priority: those are the screens a Pidgin-speaking feature-phone user sees first)
  - Persist choice in `localStorage`
  - All user-visible strings referenced via `t('key')` — no hardcoded English strings in JSX after this phase
- [ ] **Triage wizard localised first**: all 40 symptom labels, urgency strings, instructions translated
- [ ] **RTL readiness**: TailwindCSS logical properties (`ms-`, `me-`) used throughout so Arabic can be added later without a rewrite
- [ ] **Accessibility audit**:
  - All interactive elements have `aria-label` or visible label
  - Focus ring visible on keyboard navigation
  - Colour contrast ≥ 4.5:1 on all text (critical: urgency badges, alert banners)
  - One-tap call button minimum touch target 48 × 48 px
  - Voice recorder "hold to record" has keyboard alternative
  - Screen reader test on Android TalkBack for triage flow
- [ ] **Low-end device performance**:
  - Lighthouse audit on a throttled Moto G4 profile (4× CPU slowdown, Slow 4G)
  - Target: First Contentful Paint < 2 s offline, Time to Interactive < 4 s on 4G
  - Code-split each route (`React.lazy`)
  - `react-window` virtualised list for facility list (> 40 items) and consultation history
  - Preload facility data in service worker so list is instant on first offline open
- [ ] **Final QA checklist**:
  - Install to home screen on Android Chrome
  - Open app in airplane mode — facility list loads, triage runs, offline queue persists
  - Reconnect — offline queue syncs, consultation updates
  - Sign in → triage → consult → pay (sandbox) → receive push notification
  - Doctor signs in → sees RED case at top → replies → patient push notification fires
  - Operator signs in → sees callback queue

### Outputs
- EN/FR/Pidgin strings loading and switching live
- Accessibility issues resolved
- Lighthouse offline score ≥ 80
- Full demo path (Tier 1) passes QA checklist end-to-end

---

## Build Order Summary

| Phase | Depends On | Tier Impact |
|---|---|---|
| 1 — PWA Shell | — | Unblocks all UI work |
| 2 — Facility Directory | 1, Backend P2 | **Tier 1** |
| 3 — Triage Flow | 1, Backend P3 | **Tier 1** |
| 4 — Auth & Profile | 1, Backend P1 | **Tier 1** |
| 5 — Consultation & Messaging | 3, 4, Backend P4 | **Tier 1** |
| 6 — Payment | 5, Backend P5 | **Tier 1** |
| 7 — Push & History | 5, Backend P7 | Tier 2 |
| 8 — Extended Services | 4, Backend P9 | Tier 2 |
| 9 — Operator Console | 4, Backend P8 | Tier 2 |
| 10 — i18n & Accessibility | all | Tier 2 |
