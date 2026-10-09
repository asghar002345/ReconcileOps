# Frontend implementation notes

Audit and polish pass for the Vite + React 19 SPA under `frontend/`. Business logic, API paths, and the existing teal / paper brand were preserved.

## Follow-up: Reconciliation + Import CSV polish

### Copy and hierarchy
- Removed development eyebrows (`Day 2`, `Week 7 async matcher`, `Day 3 review`) and doc-path notes.
- Product copy explains what the user can do, what is required, and how to recover after failures.
- Login demo credentials remain and are labeled **Demo workspace sign-in**.

### Typography
- Kept **Source Serif 4** (display) + **IBM Plex Sans** (UI). A font swap would not meaningfully improve scanability for AED tables; refined line-height (1.5), weights, and tabular amounts instead.

### Reconciliation (`ReconciliationPage.tsx`, `lib/outcomes.ts`, `lib/format.ts`)
- Outcome filter chips with human labels, short mobile labels, tone-colored status pills.
- Keeps prior results while a new run is in progress; success only after the server returns the run.
- Refresh + retry actions on failure; `?outcome=` URL filter retained.
- Amounts shown as AED with tabular numerals; dates via `formatDateTime`.

### Import CSV (`ImportPage.tsx`, `api/client.ts`)
- Distinct **Uploading…** vs **Processing on server…** phases via `onPhase`.
- Keeps selected file on validation/server errors; Clear + Retry upload.
- Type-specific column guidance; success/reuse banners use plain language (no `reused: true` jargon).

### Local preview proxy
- `vite.config.ts` proxies `/api-proxy` → Railway for local CORS-free verification. Production builds continue to use `VITE_API_URL`.

## State management (chosen approach)

| Concern | Approach | Why |
| --- | --- | --- |
| Auth session | `AuthContext` + `sessionStorage` token | Already the app’s shared client state; no Redux/Query needed for one user blob |
| Server lists / detail | Local `useState` + `useEffect` with abort / cancel flags | Small surface (payments page, recon run, investigations). Adding TanStack Query would duplicate a working pattern |
| Shareable UI | URL search params (`page`, `outcome`) via React Router | Back/Forward and deep links without a client store |
| Theme | `localStorage` preference (non-secret) | Survives reload; unrelated to auth |

Mutations are not auto-retried. Async import/reconcile already poll operations until terminal status; the UI disables duplicate submits while busy.

## Design tokens and layout

**Files:** `src/styles/tokens.css`, `src/pages/Pages.css`, `src/components/AppShell.css`, `src/pages/LoginPage.css`

- Expanded tokens: `--accent-hover`, `--radius-sm/md`, `--control-h` (44px), `--focus-ring`, transition timings, `--page-max`.
- Global `:focus-visible` rings; `prefers-reduced-motion` short-circuits transitions.
- Skip link, denser mobile nav, overflow-safe tables (`min-width: 0`, wrap anywhere on long text).
- Metric grids: three columns on overview (desktop), pair layout on investigation detail, dense auto-fit on reconciliation filters.
- Soft gradient hover on primary actions and nav links (readable over brand teal; no glow).

## Auth and navigation

**Files:** `src/auth/AuthContext.tsx`, `src/lib/tokenStorage.ts`, `src/lib/safeRedirect.ts`, `src/App.tsx`, `src/pages/LoginPage.tsx`, `src/main.tsx`

- JWT moved from `localStorage` → `sessionStorage`, with one-time migration of legacy keys.
- 401 responses invoke a registered unauthorized handler that clears the session.
- Protected routes stash `from` location; login redirects only through `safeInternalPath` (blocks `//`, absolute URLs, backslashes).
- Theme applied at boot so the first paint matches preference.

## API client and errors

**Files:** `src/api/client.ts`, `src/lib/userFacingError.ts`

- Optional `AbortSignal` on reads; abort errors are not remapped to network failures.
- Network failures return a clear `ApiError` message.
- Pages map statuses (401/403/404/409/422/429/5xx/offline) via `userFacingError` without exposing stacks.
- Upload helper validates CSV type/size client-side (`src/lib/uploadValidation.ts`); server remains authoritative.

## Feature changes by page

| Area | Files | Behavior |
| --- | --- | --- |
| Shell | `AppShell.tsx` | Skip link, `aria-pressed` theme toggle, active nav styling, main landmark focus target |
| Status | `StatusBanner.tsx` | `role="alert"` + assertive live region for danger/warning |
| Overview | `OverviewPage.tsx` | Abortable load; keep prior metrics while refreshing |
| Payments | `PaymentsPage.tsx` | `?page=` in URL; caption; pager status; soft refresh |
| Import | `ImportPage.tsx` | Client CSV validation, field errors, `aria-invalid` |
| Reconciliation | `ReconciliationPage.tsx` | `?outcome=` filter; `aria-pressed` chips; duplicate-click guards |
| Investigations | `InvestigationsPage.tsx` | Retry on error; table caption |
| Investigation detail | `InvestigationDetailPage.tsx` | 404 empty state; whitespace guards; busy labels; paired metrics |

## Hosting

**Files:** `frontend/vercel.json`, `frontend/public/robots.txt`, `frontend/index.html`

- SPA rewrite unchanged.
- Security headers: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, staged CSP (`connect-src` allows Railway `*.up.railway.app` and local API).
- `robots.txt` Disallow + `noindex` meta (indexing preference, not access control).

## Dependencies

- **Added:** none in production.
- **Dev:** none lasting beyond `@types/*` already present. Tests use Node’s built-in test runner (`node --experimental-strip-types --test`).
- Explicitly **not** added: TanStack Query, Redux Toolkit, animation libraries, CAPTCHA SDKs.

## Tests

`npm test` runs:

- `safeRedirect.test.ts`
- `tokenStorage.test.ts`
- `uploadValidation.test.ts`
