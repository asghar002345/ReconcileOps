# Frontend QA notes

## Pages and journeys reviewed

1. Login → overview (redirect, session hydrate)
2. Overview metrics + links (no full reload)
3. Payments pagination (`?page=`) and Back/Forward intent
4. **Import CSV** — lead copy, type help, disabled submit without file, selected-file meta, upload vs processing copy
5. **Reconciliation** — load latest run from API, outcome chips + URL `?outcome=`, status pills, Investigate actions, keep results while running
6. Investigations list → detail → note / propose / decide / explain
7. Theme toggle + sign out
8. Deep link `/investigations/:id` behind auth (redirect to login with return path)

## Browser verification (this pass)

Local preview: `VITE_API_URL=/api-proxy npm run build && npm run preview` (proxy to production Railway API).

| Check | Result |
| --- | --- |
| Sign in with demo analyst | Passed |
| Reconciliation shows live outcomes (Matched, Amount mismatch, …) | Passed |
| Filter `?outcome=AMOUNT_MISMATCH` updates URL and table | Passed |
| Mobile 320px: no page-level horizontal scroll; table scrolls inside `.table-wrap` | Passed |
| Mobile short chip labels (Amount / No bank / …) | Passed |
| Import page copy, form, disabled Upload without file | Passed |
| Real oversized/malformed CSV against API | Not re-run this pass (client validation covered by unit tests) |
| Live “Run again” / upload success after new file | Not forced (would mutate shared demo data); idle/success/error UI paths reviewed in code + prior API behavior |

Viewports exercised in browser/CDP: **320**, **390** (emulated), plus default desktop (~1440). Intermediate **768/1024** covered by CSS breakpoints and layout inspection.

## Copy / dummy content audit

Removed or replaced: `Day 2`, `Week 7 async matcher`, `Day 3 review`, `docs/*.md` pointers, `reused: true` / hash jargon as primary messaging, “Sample expected net” wording.

Retained intentional demo login hint, clearly labeled.

## Commands run

From `frontend/`:

```bash
npm test
# 12 passed (format, safeRedirect, tokenStorage, uploadValidation)

npm run lint
# oxlint warnings only (fetch-in-effect / AuthContext export)

npm run build
# tsc -b && vite build — success

npm audit
# found 0 vulnerabilities
```

## Regression tests

| File | Covers |
| --- | --- |
| `src/lib/safeRedirect.test.ts` | Open-redirect rejection |
| `src/lib/tokenStorage.test.ts` | sessionStorage + legacy migration + clear |
| `src/lib/uploadValidation.test.ts` | CSV type/size gates |
| `src/lib/format.test.ts` | AED fils formatting |

## Remaining / backend dependencies

- Import row-level errors depend on API `errors[]` payload shape.
- Approver decision UI needs an approver session (not used in this browser pass).
- Production Vercel must set `VITE_API_URL` to the Railway API (not `/api-proxy`).
- 200% zoom and VoiceOver full pass not run.
