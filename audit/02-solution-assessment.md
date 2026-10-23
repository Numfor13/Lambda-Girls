# CareBridge: Solution Assessment Against the Problem Statement

|                    |                                                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Question**       | Does what the team built solve the problem they were given, and solve it well?                                                                     |
| **Inputs**         | Problem statement, `Health Track - Feature List v2` (40 in-scope features), the code at `85950e6`, and the deployed dev environment                |
| **Companion docs** | [01-system-audit.md](01-system-audit.md) has defect details (SYS-xx ids). [03-backend-cloud-audit.md](03-backend-cloud-audit.md) covers the cloud. |

> **Problem statement.** Many people in Buea and surrounding communities face barriers to accessing timely, reliable healthcare and health information. Distance to health facilities, cost, unreliable electricity, limited internet connectivity, and restricted access to digital devices often lead people to delay care, rely on misinformation, or seek help only when conditions become serious. _How might we develop affordable, accessible solutions that improve health outcomes for communities around Buea, regardless of their infrastructure limitations?_

---

## 1. Verdict

**The product thinking is strong. The delivered solution is a convincing demo and a non-working system.**

The team read the brief correctly:

- offline-first;
- a danger-sign triage that tells people _when_ to go;
- voice notes instead of video;
- SMS/USSD for people without smartphones;
- pay-per-consult over mobile money;
- consulting on behalf of a phone-less neighbour;
- "four things we say before anyone asks".

That is better product reasoning than most hackathon teams manage. The feature list's honesty section (rules not clinically validated, SMS/USSD simulated, video excluded on purpose) is exactly right.

The execution has three problems:

1. **The parts that answer the hardest barriers were never surfaced to users.** "No device" and "no internet" are the heart of the brief. SMS/USSD, the nurse callback and the operator console exist only as backend endpoints, with no UI and no telco path. French and Pidgin don't exist at all. Health tips (the "misinformation" answer) are not shown anywhere.
2. **The parts that are surfaced work only in mock mode.** Against the real backend, sign-in fails, payment never confirms, the facility API is empty and push is broken. The happy path depends on `mock.ts`.
3. **Safety and trust gaps undercut the core promise.** Two triage rules under-triage sick children. "One-tap call" dials made-up numbers. The SMS channel tells RED patients to call France's ambulance number. Any user can write "doctor" messages into another patient's chat.

**Score against the brief: about 4 / 10 as delivered, and about 7 / 10 for the design if executed.**

| Barrier in the brief          | Addressed by design?         | Addressed by working code?                                                                   |
| ----------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------- |
| Distance to facilities        | ✅ Yes                       | 🟡 Partly (offline directory works; data unverified)                                         |
| Cost                          | 🟡 Partly                    | 🟡 Partly (fee hard-coded, never actually collected)                                         |
| Unreliable electricity        | 🟡 Weakly                    | 🟡 Weakly (offline helps; nothing power-specific)                                            |
| Limited internet connectivity | ✅ Yes                       | 🟡 Partly (offline triage and directory work; signed-in flows break offline; 2.9 MB install) |
| Restricted access to devices  | ✅ Yes (SMS/USSD, on-behalf) | 🔴 Mostly no (no UI, no telco, on-behalf list broken)                                        |
| Misinformation                | 🟡 Partly                    | 🔴 No (health tips not shown; English only)                                                  |
| Delay → serious conditions    | ✅ Yes (triage)              | 🟡 Partly (works offline, but with clinical defects)                                         |

---

## 2. Barrier-by-barrier assessment

### 2.1 Distance to health facilities

**What they built:**

- A 40-facility Buea directory bundled into the app and stored in IndexedDB.
- Distance sorting on the device (Haversine, with a quarter-centroid fallback when GPS is unavailable).
- Facility detail with capabilities, hours, backup power, CSU card and fee.
- Directions via `geo:`/OSM.
- `tel:` call buttons.
- Triage results route to the nearest facility with the right capability.

**What works:**

- The whole directory flow works **fully offline** after install. This is the best-executed part of the product.

**Loopholes:**

- **The data is not real enough to rely on.** Most phone numbers are sequential placeholders (`+237677001122`, `+237677112233`, `+237677223344`, …). The RED-result "Call {facility}" button would ring a stranger during an emergency (SYS-14). Coordinates, hours, fees and "backup power" flags are unverified. The feature list itself calls the dataset "the highest-value task on the board", and it is the least verified asset.
- **The server copy is empty.** The seed script crashes, so admin edits, blood-bank lookup and referral-to-facility have nothing to work on (SYS-04). Any correction to a facility would require shipping a new app build.
- **No emergency number exists anywhere in the PWA.** A RED result should always show it.
- **No map.** Leaflet is installed but unused, and the `map_view` flag is never read. That's acceptable, because the list is the right primary UI for this audience.

**Verdict:** right idea, good offline implementation, data not ready for real use.

### 2.2 Cost

**What they built:**

- Pay-per-consultation through Fapshi mobile money.
- "Pay for someone else" via a share link.
- A serverless backend that can scale to zero.

**Loopholes:**

- **Payment never completes on the real backend.** Dev returns a fake URL; the webhook can't find payments and can be forged by anyone (SYS-02/03). The payer chooses the amount (SYS-06).
- **The fee is hard-coded to 2000 XAF** in both frontend and backend. Every facility has a `consultation_fee_xaf`, which the facility detail page displays but no backend code reads.
- **There is no free path to a human.** The design gates the doctor queue on payment, which is correct for sustainability. But the brief names cost as a barrier, and nothing exists for someone with a RED triage and no money: no free emergency escalation, no subsidy, no CSU (universal health coverage) integration beyond a "accepts CSU card" flag.
- **Data cost.** The first install is 2.9 MB, including a 543 KB logo stored twice and unused font subsets (SYS-22). On metered data in Buea that is a real cost and a real failure risk. Workbox install is all-or-nothing, so an interrupted download leaves no offline capability.
- **The infrastructure isn't cheap either.** Idle AWS cost is about $38/month, and 96% of it is an unused NAT gateway (see doc 03). Trivial money, but it contradicts the "affordable" brief and shows nobody looked.
- Payment receipts and history: the backend exists, but the frontend never calls it, so no history is shown.

**Verdict:** the model is sound, but the money path is broken and insecure, and there is no answer for the patient who can't pay.

### 2.3 Unreliable electricity

**What they built:** nothing specific. Offline-first helps indirectly, because work is not lost when the network drops.

**Loopholes:**

- No battery-conscious behaviour: no reduced animation on low battery, and `motion` animations run everywhere apart from honouring reduced-motion settings.
- `autoUpdate` service worker reloads can wipe a half-filled form when the phone reconnects after an outage (SYS-35).
- `navigator.storage.persist()` is never requested, so on a low-storage phone the browser can evict the offline outbox.
- The facility "backup power" attribute is the only electricity-aware data point, and it is unverified.
- The real answer, solar-powered community booths, is on the roadmap only.

**Verdict:** addressed only by side effect. Acceptable for a hackathon, but say so in the pitch.

### 2.4 Limited internet connectivity

**What they built:**

- An installable PWA with a precached shell.
- An offline facility directory.
- Offline triage (38 rules over 38 symptoms, running in the browser).
- An IndexedDB outbox with ULID dedupe keys.
- Voice notes recorded offline and uploaded later.
- Server-side triage recompute on sync.

**What works:**

- With no login, the offline triage and directory genuinely work. The rules engine is identical between browser and server (verified), and "why this result" shows the rules that fired.

**Loopholes:**

- **Signed-in features break offline.** Tokens sit in `sessionStorage`, which is wiped when the app closes. After about an hour, or a restart, an offline user can't open their own consultations stored on the device, and the outbox stalls until they reconnect _and_ sign in again (SYS-17).
- **Flaky networks are handled worse than no network.** There are no request timeouts. Retries are exhausted in about 30 seconds, and after that items fail permanently. An expired session looks like "you're offline" because error responses lack CORS headers (SYS-21, SYS-25, SYS-26).
- **Duplicates on retry.** An online triage is submitted twice (SYS-16), and creating a consultation is not idempotent (SYS-27). This is the exact scenario offline-first must get right.
- **Doctor replies can't be heard offline.** Voice notes are fetched on play and never cached.
- **"Priority escalation on reconnect"** is only partly real. Triage syncs before consultations, but urgency is client-supplied and forgeable (SYS-07).

**Verdict:** the best-thought-out area of the design. The anonymous, logged-out path is solid. The authenticated path doesn't yet survive real-world connectivity.

### 2.5 Restricted access to digital devices

This is the barrier the brief stresses and the one where the gap between claim and delivery is largest.

**What they designed:**

- SMS and USSD sharing one session engine.
- A nurse callback.
- An operator console where staff take phone calls and search facilities.
- Consulting on behalf of a household member or neighbour without a phone.
- Anonymous mode for people sharing a phone.

**What exists:**

| Piece                   | Status                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SMS/USSD session engine | 🔴 **Toy.** It asks for age and ignores it; it has its own 5-symptom list, not the 38-symptom rules; "find nearby hospital" only echoes the area name; it tells RED users to "call 15" (France's SAMU). It doesn't reuse the triage rules, despite the feature list describing it as "sitting on the triage rules already written" (SYS-15). |
| SMS transport           | 🔴 No outbound SMS is ever sent (only logged). Inbound is a public unauthenticated POST.                                                                                                                                                                                                                                                     |
| USSD transport          | 🔴 Uses the wrong wire format for real gateways (JSON instead of form data plus `CON`/`END`). No simulator UI exists.                                                                                                                                                                                                                        |
| Nurse callback          | 🟡 Written to the operator queue, but silently dropped the second time in a session (SYS-39). Anyone can create one for any number.                                                                                                                                                                                                          |
| Operator console        | 🔴 Backend endpoints only. **No UI.** The role exists in a TypeScript type and nowhere else.                                                                                                                                                                                                                                                 |
| On-behalf consultation  | 🟡 The UI works, but those consultations **disappear from the owner's list** on the real backend (SYS-11).                                                                                                                                                                                                                                   |
| Anonymous mode          | 🔴 The backend is the most carefully written code in the repo, but **the frontend never calls it.**                                                                                                                                                                                                                                          |
| Shared-phone safety     | 🔴 Logout leaves the push subscription, location, mock data and caches behind. The next user on the same phone gets the previous user's "doctor replied" alerts (SYS-30).                                                                                                                                                                    |

**Verdict:** the design answers the barrier; the delivered product does not. Today, a person with a feature phone can do nothing with CareBridge. This should be the first thing the team is honest about.

### 2.6 Misinformation and health information

**What they built:**

- A health-tips backend with source and date attribution, which is the right policy.
- Advisory labels on triage results.
- Facility information.

**Loopholes:**

- **Health tips are not shown anywhere in the app.** The backend endpoint works (live: `{"tips": [], "count": 0}`), but there is no UI and no content.
- **The app is English only.** The French and Pidgin selectors are rendered but disabled. The i18n backend exists, but its bucket is empty (live: `404`) and the frontend never calls it. Buea is anglophone, but Pidgin is the common language of the target group, and many residents and displaced people from francophone regions read French more easily. The feature list itself says Pidgin should come "starting with the triage and USSD screens".
- **The triage checklist is text-only English** for a low-literacy audience, with no pictograms and no read-aloud. Voice is supported only in the doctor chat.
- The advisory disclaimer is 12 px text at the bottom of the result.

**Verdict:** essentially unaddressed in delivered code.

### 2.7 Delay in seeking care / "seek help only when serious"

**What they built:** the danger-sign triage with RED, AMBER and GREEN routing. This is the core intervention, and the right one.

**Loopholes (clinical safety):**

- **"Breathing fast" selected without a breath count → GREEN, "care at home"** (SYS-12). Pneumonia is a leading killer of under-fives, so this is the worst possible miss.
- **Fast-breathing age bands are off by one** compared with WHO IMCI. A 12-month-old at 40–49 breaths/min and a 2-month-old at 50–59 are missed, and the unit test enshrines the bug (SYS-13).
- Fever and chest indrawing in infants under 2 months are only AMBER. Under IMCI, any danger sign in a young infant warrants urgent referral. This needs a clinician's review.
- A first-time user must tick a consent box before seeing RED guidance (SYS-31). Advice should come first and consent should be asked only for upload.
- The counts differ from the claim: 38 rules over 38 symptoms, against the advertised "~30 rules over 40 symptoms". That's minor, but say it accurately.
- The team rightly states the rules are not clinically validated. Two concrete bugs show why that sign-off has to happen before any real use.

**Verdict:** the right core feature with the right architecture (same engine offline and on the server, auditable rules). It needs a clinical fix pass before anyone outside the team sees it.

---

## 3. Feature-by-feature status (all 40 in-scope features)

Legend:

- ✅ works on the real backend
- 🎭 works in mock mode only
- 🟡 partial or defective
- 🔴 missing or broken
- **BE-only** means the backend exists but there is no frontend UI

### Tier 1: "these seventeen must work"

| #   | Feature                                  | Status | Notes                                                                                     |
| --- | ---------------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| 1   | PWA installs, low-end Android            | 🟡     | Installs. The 2.9 MB atomic precache is heavy for low-end phones and metered data.        |
| 2   | Offline facility directory               | ✅     | Bundled seed plus Dexie; works with no network.                                           |
| 3   | Facility detail                          | ✅     | Data unverified.                                                                          |
| 4   | One-tap call                             | 🟡     | Works technically; numbers are placeholders (SYS-14).                                     |
| 5   | Distance sorting                         | ✅     | On-device, with a sensible fallback.                                                      |
| 6   | Offline write queue                      | 🟡     | Exists; retry, timeout, idempotency and auth-expiry defects (SYS-16/17/25-28).            |
| 7   | Offline triage (~30 rules / 40 symptoms) | 🟡     | 38/38; works offline; two under-triage bugs.                                              |
| 8   | RED/AMBER/GREEN routing                  | ✅     | Matched against the directory by capability.                                              |
| 9   | Auditable results                        | ✅     | "Why this result" plus the doctor's rules table.                                          |
| 10  | Account and profile (Cognito Hosted UI)  | 🔴     | **Sign-in fails live (`invalid_scope`, SYS-01).** DOB can't be set.                       |
| 11  | Text consultation                        | 🎭     | Works in mock; on live, blocked by sign-in and payment.                                   |
| 12  | Voice notes, both directions             | 🎭     | Patient side queues offline; doctor replies are online only; authorization hole (SYS-10). |
| 13  | Consulting on behalf of someone else     | 🟡     | Created, then missing from the owner's list on live (SYS-11).                             |
| 14  | Pay per consultation (Fapshi)            | 🔴     | Fake URL in dev; never calls Fapshi; forgeable (SYS-02).                                  |
| 15  | Payment confirmation webhook             | 🔴     | Lookup broken (SYS-03); unauthenticated in dev.                                           |
| 16  | Doctor queue, case view, reply           | 🎭     | Unreachable on live (no paid cases, no doctor accounts, no onboarding path).              |
| 17  | Seeded Buea dataset                      | 🟡     | 40 facilities bundled in the app; server seed crashes; numbers unverified.                |

**Tier 1 tally:** 5 ✅, 6 🟡, 3 🎭, 3 🔴. Every ✅ item is an offline, no-login feature. Every item that needs the backend is 🎭 or 🔴, so the demo works only in mock mode.

### Tier 2: ordered backlog

| #   | Feature                                   | Status     | Notes                                                                                                                           |
| --- | ----------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 18  | Shared conversation engine (web/SMS/USSD) | 🔴         | A separate toy state machine; doesn't reuse the rules.                                                                          |
| 19  | SMS consultation and triage               | 🔴 BE-only | No outbound SMS, no simulator UI.                                                                                               |
| 20  | USSD menu                                 | 🔴 BE-only | Wrong gateway format; no simulator UI.                                                                                          |
| 21  | Nurse callback                            | 🟡 BE-only | Written to the queue; duplicates dropped; spoofable.                                                                            |
| 22  | Operator console                          | 🔴 BE-only | No UI.                                                                                                                          |
| 23  | Web push "doctor replied"                 | 🔴         | Broken at every layer (SYS-09).                                                                                                 |
| 24  | Consultation history timeline             | 🟡         | Consultation list only; no unified timeline.                                                                                    |
| 25  | Available doctors list                    | 🔴 BE-only | Dead link to `/app/doctors`.                                                                                                    |
| 26  | Click-to-call voice (masked callback)     | 🔴         | Not built anywhere.                                                                                                             |
| 27  | Prescription record and code              | ✅ / 🎭    | Code lookup works live; issuing needs the doctor flow. Codes not cryptographically random and never expire.                     |
| 28  | Referral record and code                  | ✅ / 🎭    | Same as above.                                                                                                                  |
| 29  | Duplicate-safe messaging                  | 🟡         | `client_message_id` dedupe exists; two paths dedupe differently; consultation create not idempotent.                            |
| 30  | Map view (Leaflet/OSM)                    | 🔴         | Dependency installed, never used.                                                                                               |
| 31  | Appointment booking                       | 🔴 BE-only |                                                                                                                                 |
| 32  | Lab test request with home collection     | 🔴 BE-only | Staff can't list requests.                                                                                                      |
| 33  | Blood availability and request            | 🔴 BE-only | The blood-bank filter chip exists; requests can never leave `pending`.                                                          |
| 34  | Emergency location share                  | 🔴 BE-only | Dead link to `/app/emergency`; the SNS alert topic has **no subscribers**, so alerts go nowhere, and records expire after 24 h. |
| 35  | Health tips feed                          | 🔴 BE-only | No UI, no content.                                                                                                              |
| 36  | Paying for someone else                   | 🎭         | Share-link UI exists; depends on broken payment.                                                                                |
| 37  | Payment receipts and history              | 🔴         | API helper defined, never called.                                                                                               |
| 38  | Anonymous question mode                   | 🔴 BE-only | Good backend, zero frontend.                                                                                                    |
| 39  | Priority escalation on reconnect          | 🟡         | Triage synced first; urgency is forgeable; the `has_red_triage` flag exists only in the mock.                                   |
| 40  | English, French and Pidgin                | 🔴         | English only; the i18n bucket is empty.                                                                                         |

**Tier 2 tally (23 features):** 0 fully working, 2 partly working (prescription and referral codes), 4 partial, 1 mock-only, 16 missing, broken or backend-only.

**What this means:** 45% of the backend's Lambdas (Channel 5, Extended 18, Anonymous 6, I18n 1: 30 of 66) serve features that have no UI. The team built Tier 2 backend while Tier 1 integration remained broken. This inverts the feature list's own rule: "If Tier 1 is not finished, nothing else matters." The flags hid unfinished UI as intended, but the backend work behind those flags would have been better spent on Tier 1 integration.

---

## 4. Loopholes in the solution design (beyond bugs)

These are gaps that would remain even with perfect code.

1. **No doctor supply model.**
   - Who are the doctors, how are they verified, and how do they join? Doctor accounts can be created only by an engineer with the AWS CLI (`admin-add-user-to-group`).
   - There is no licence check, no on-call rota and no response-time promise.
   - "Available doctors" and presence exist only on the backend.
   - An asynchronous consult with no SLA can _increase_ delay for a RED patient who waits for a reply instead of going to the facility.
   - **Recommendation:** RED results should never route to a paid async consult. They should route to the facility and an emergency number.
2. **RED triage with no money has no path.** The queue is payment-gated. Add a free escalation for RED, or at least make the result screen's primary action "go now / call".
3. **The verification loop with facilities and pharmacies is open.** Prescription and referral codes are publicly readable, never marked dispensed and never expire. A pharmacy cannot "use up" a code, so it can be reused indefinitely. Facilities have no way to confirm arrival or update their own data.
4. **Clinical governance.**
   - There is no versioning of rule sets on results, so you can't tell which rule version produced a past decision.
   - There is no clinician sign-off workflow.
   - There is no audit of doctor actions beyond the message log.
   - Any doctor can act on any case (SYS-20).
5. **Privacy and consent for health data.**
   - No retention or deletion policy and no account deletion.
   - Consent is a UI checkbox, not a stored record.
   - Full request bodies (symptoms, messages, phone numbers) are logged with no expiry.
   - Data is stored in the US.
   - Cameroon's 2024 personal data protection law should be checked for cross-border transfer and health-data rules before any real patient data is collected (see doc 03 §6).
6. **Shared-device reality.** Many families share one phone. The design acknowledges this (anonymous mode, on-behalf consults), but logout hygiene, anonymous mode in the UI, and per-user outbox tagging are all missing.
7. **Trust signals.** A first-time user sees a payment wall before any proof the service is real: no visible doctor names or credentials, no receipts, no history.
8. **Operations.**
   - There are no alarms, so nobody would know payments were failing.
   - The emergency alert topic has no subscribers, so an emergency location share notifies no one.
   - A user pressing "emergency" and believing help is coming, when nothing happens, is a harm, not a missing feature. It is behind a flag today; keep it there until a human is actually on the other end.

---

## 5. What is genuinely good (keep it)

- **Problem framing.** Voice notes over video, the "96% have a mobile subscription vs 42% use the internet" argument, and the honest roadmap. Use these in the pitch exactly as written.
- **Offline architecture.** Bundled seed plus Dexie, an outbox with ULIDs, a single service worker (push merged via `importScripts`, no scope conflict), and on-device distance sorting.
- **The triage engine design.** A pure, stateless rules engine that is identical in browser and Lambda (verified byte-for-byte), recomputed server-side on sync, with every fired rule recorded and shown to patient and doctor.
- **Anonymous mode backend.** uuid4 session tokens, server-side expiry, hashed ids, doctor-side redaction and ownership checks. It's the most carefully written code in the repo and deserves a frontend.
- **Accessibility basics.** 44–56 px touch targets, ARIA on icon buttons, live regions for sync state, reduced-motion support, a tap-to-count breath counter, and a keyboard-operable recorder.
- **Serverless, pay-per-request data layer**, which suits a low-volume, cost-sensitive service once the NAT gateway is removed.

---

## 6. What to do next

### Before any demo against the real backend (1 day)

1. Fix sign-in (SYS-01), payment (SYS-02/03/06) and seeding (SYS-04); redeploy.
2. Untrack `.env` so mock mode is the default for local development.
3. Fix the two child-breathing rules and the "call 15" text. Add a verified Cameroonian emergency number to every RED result.
4. Replace placeholder phone numbers with verified ones, or clearly label the directory as sample data.

### To actually answer the brief (next 2–4 weeks)

1. **Device access:** build an SMS/USSD simulator page and an operator console on top of the existing backend, and make the session engine call the real triage rules. This is the single most important gap against the problem statement.
2. **Language:** ship French and Pidgin for triage and USSD first, as the team's own feature list says.
3. **Connectivity:** offline identity, timeouts, retry policy, idempotent create, cached doctor voice replies, `storage.persist()`, and an install under 1 MB.
4. **Cost:** a free RED escalation path, server-side fees per facility, and receipts.
5. **Information:** a health-tips UI with sourced content.
6. **Safety and trust:** ownership checks everywhere, a doctor onboarding and verification process, rule versioning, and clinician sign-off with the University of Buea teaching hospital, as the roadmap already names.
