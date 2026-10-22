# CareBridge — Frontend

Offline-first PWA for the Health Track backend. React 19 + TypeScript + Vite, Tailwind CSS v4, TanStack Query, Dexie (IndexedDB), Workbox.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # triage engine unit tests
npm run lint
npm run build      # type-check + production build + service worker
```

With no `.env` the app runs fully on its **mock API** (`src/api/mock.ts`) and **demo sign-in** (choose Patient or Doctor). Data is kept in the browser, so you can play the whole demo — triage, consult, pay, doctor reply — in one browser.

## Connecting the backend

Copy `.env.example` to `.env.local` and fill in the API Gateway URLs and Cognito values. The mock turns off as soon as any API URL is set; demo sign-in turns off once Cognito is configured. No UI code changes are needed: the mock mirrors the Lambda response shapes exactly.

## Layout

| Path | What lives there |
| --- | --- |
| `src/api` | HTTP client, endpoint functions, backend types, mock adapter |
| `src/auth` | Cognito Hosted UI (oidc-client-ts) session, route guard |
| `src/offline` | Dexie schema, outbox, sync engine, voice recorder, facility cache |
| `src/triage-engine` | Browser copy of the backend rules (`Backend/.../triage/rules`) — keep in step |
| `src/design` | Design tokens are in `src/index.css`; components in `design/components` |
| `src/features` | One folder per screen group (landing, facilities, triage, consult, payments, doctor, profile) |
| `src/data/facilities.seed.json` | The 40 seeded facilities with the same IDs the backend seed script creates |
| `src/config/flags.ts` | Feature flags; unfinished Tier 2 features stay hidden |

## Photos

The landing page photo cards load `public/images/care-for-family.jpg`, `message-a-doctor.jpg` and `request-lab-test.jpg`. Until licensed photos are added there, an illustrated fallback is shown.
