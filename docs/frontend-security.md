# Frontend security notes

## Findings and fixes

| Finding | Severity | Fix / status |
| --- | --- | --- |
| JWT in `localStorage` (XSS-durable) | High (architecture) | Moved to `sessionStorage`; cleared on logout and 401. **Remaining:** true hardening needs HttpOnly Secure cookies + CSRF strategy on the API |
| Post-login redirect from `location.state` | Medium | `safeInternalPath` rejects absolute / protocol-relative / backslash paths |
| Demo credentials prefilled on login | Low (demo UX) | Left for the seeded demo; rotate before any shared production URL |
| API error bodies rendered | Low | Messages shown; stacks not logged; 5xx collapsed to generic copy |
| CSV upload trust | Medium (server) | Client type/size checks added; **server must** keep validating MIME/size/schema |
| Missing browser security headers | Medium | Added on Vercel via `frontend/vercel.json` |
| Private app indexing | Low | `robots.txt` + `noindex` (not access control) |
| `npm audit` | — | Production deps: 0 vulnerabilities after dropping Vitest |

## Authentication and session assumptions

- Contract remains **Bearer JWT** in `Authorization` header (`VITE_API_URL` only points at the API base URL — no secrets in Vite env).
- Token lifetime is whatever the API issues (`expiresIn` is informational; no silent refresh client).
- Route guards (`Protected`) are UX only; every API call must enforce workspace/role server-side (already Nest guards).
- Logout clears both `sessionStorage` and any legacy `localStorage` token key.

### Backend follow-ups for cookie sessions (not implemented)

If moving off bearer tokens in JS storage:

1. Issue `Secure; HttpOnly; SameSite=Lax|Strict` session cookie from the API.
2. Align CORS + credentials; add CSRF token or SameSite-strict design.
3. Remove client token storage entirely.
4. Keep `/auth/me` for hydration.

## Frontend vs backend / hosting

| Control | Owner |
| --- | --- |
| Role / workspace isolation | Backend |
| Idempotency of imports / reconcile / proposals | Backend |
| Rate limits / 429 | Backend or edge |
| CSP, HSTS, frame denial | Hosting (`vercel.json` CSP/XFO; enable HSTS in Vercel project settings) |
| CORS allowlist | Backend `CORS_ORIGINS` |
| Captcha / bot challenges | Not added (would need server-side token verify) |

CORS is not authorization. CSP was staged to allow Google Fonts and Railway API hosts; if `VITE_API_URL` changes domain, update `connect-src`.

## Bot and crawler policy

- **Crawlers:** `Disallow: /` and `noindex` express “do not index this demo UI.” Anyone can still load the JS bundle; secrets must not live there.
- **Abuse:** Prefer API rate limits on `/auth/login`, imports, and explain. Frontend maps 429 to a retry message. No CAPTCHA, no right-click blocking, no fingerprinting.

## Remaining risks

1. XSS still exposes `sessionStorage` tokens for the tab lifetime — prefer HttpOnly cookies later.
2. CSP `style-src 'unsafe-inline'` required for some Vite/font setups; tighten if moving to hashed styles only.
3. HSTS should be enabled at the Vercel project / domain level (not only app headers).
4. Demo password in the login hint is intentional for PayDemo; remove for public launches.
