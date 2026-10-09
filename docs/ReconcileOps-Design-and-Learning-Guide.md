# ReconcileOps — Design and Learning Guide

Living document for how we design and build this project. Pair with [SPEC.md](SPEC.md), [PROGRESS.md](PROGRESS.md), and [BUILD_LOG.md](BUILD_LOG.md).

**Legend:** `[implemented]` exists in the repo today. `[planned]` is specified but not built yet.

---

## 1. What the product needs

ReconcileOps is an AED payment reconciliation and investigation platform. The three-day sprint delivers a **backend prototype** that:

1. Authenticates an analyst and a different approver.
2. Imports two fixed CSV formats (payments and bank settlements).
3. Matches them deterministically and surfaces discrepancies. `[planned]` matcher
4. Lets an analyst propose a resolution that another user approves. `[planned]`
5. Keeps an audit trail. `[planned]`

Money is exact integer **fils** (100 fils = AED 1.00). Source evidence (CSV rows, hashes, source ids) is preserved separately from later human decisions.

---

## 2. How requirements become backend modules

| Requirement | Module / area | Endpoints / behavior |
|---|---|---|
| Fail fast on bad config | `configuration` `[implemented]` | `validateEnv` for `DATABASE_URL`, `PORT`, `JWT_*` |
| Prove DB is up | `health` `[implemented]` | `GET /health` → `SELECT 1` |
| Login and actor | `identity` `[implemented]` | `POST /auth/login`, `GET /auth/me`, JWT guard |
| Read payments | `payments` `[implemented]` | `GET /payments?page=&pageSize=` |
| Load CSVs | `imports` `[implemented this pass]` | `POST /imports/payments`, `POST /imports/bank-entries` |
| Match records | `reconciliation` `[implemented]` | `POST /reconciliation/runs`, latest/detail |
| Investigate | `investigations` `[implemented]` | Propose / approve / audit |
| Webhooks | `webhooks` `[implemented]` | Signed `payment.captured` via outbox/worker (Week 8) |
| Knowledge | `knowledge` `[implemented]` | pgvector policy retrieve + Explain discrepancy |
| Explain (RAG) | `knowledge` `[planned]` | Read-only explanation |

**Controllers stay thin:** validate input, call a service, return the documented response. Business rules live in services (and later in SQL for matching).

### Nest request path `[implemented]`

```
HTTP → Guard (optional) → ValidationPipe / DTO → Controller → Service → Prisma/SQL → JSON
```

Example for payments:

1. `JwtAuthGuard` validates Bearer token.
2. `JwtStrategy` loads membership from the database (role is not trusted from the client).
3. `ListPaymentsQueryDto` validates `page` / `pageSize`.
4. `PaymentsService.listPayments(workspaceId, …)` queries only that workspace.
5. Fils leave the API as **strings** so JSON does not lose `BIGINT` precision.

---

## 3. PostgreSQL schema design

Source of truth: [backend/prisma/schema.prisma](../backend/prisma/schema.prisma) and migration `20261007130000_day1_foundation`.

### Tables

| Table | Purpose |
|---|---|
| `workspaces` | Fixed tenant for the sprint (`ws_demo`) |
| `users` | Login identity + bcrypt `password_hash` |
| `memberships` | User ↔ workspace ↔ role (`analyst` / `approver`) |
| `import_batches` | One uploaded file: kind, hash, status, row count |
| `import_rows` | Raw evidence per row number + source id |
| `payments` | Canonical payment facts |
| `bank_entries` | Canonical bank settlement facts |

### Important columns and why

- **`BIGINT` fils** — binary floating point cannot represent money exactly. Integer fils avoid rounding bugs.
- **`source_payment_id` / `source_bank_entry_id`** — provider identity; unique per `(workspace_id, provider_account_id, source_*)`.
- **`reference_original` + `reference_normalized`** — matching key is normalized (trim + uppercase); original is preserved for audit.
- **`file_hash_sha256`** — identical-file replay detection without storing the whole file forever in the sprint.
- **`paid_at` timestamptz vs `settled_at` date** — payment has a UTC instant; bank export is date-only.

### Keys, constraints, indexes

- PKs: string ids (`cuid` or fixed workspace id).
- FKs: memberships → users/workspaces; payments/bank_entries → workspaces; import rows → batches (`ON DELETE CASCADE`).
- UNIQUE: email; membership `(workspace, user)`; batch `(workspace, provider, kind, hash)`; payment/bank source ids; import row `(batch, row_number)`.
- CHECK `[implemented]`: currency = `AED`; amounts ≥ 0; fee ≤ gross.
- INDEX on `(workspace_id, provider_account_id, reference_normalized, currency)` for matching joins `[planned use]`.

### Migrations

Prisma Migrate holds reviewed SQL. We add CHECK constraints by hand when Prisma cannot express them. Do not weaken a failed integrity check to meet a deadline.

### Unmatched payments query `[implemented as SQL file]`

See [unmatched-payments.sql](unmatched-payments.sql). Payments with no bank row sharing workspace, provider, normalized reference, and AED.

---

## 4. End-to-end data flow

### Implemented today

```
Browser/curl
  → POST /auth/login { email, password }
  → accessToken
  → GET /payments  Authorization: Bearer …
  → page of payments (fils as strings)

  → POST /imports/payments  multipart file + Bearer
  → validate all rows OR 400 with row errors
  → one transaction: batch + rows + payments
```

### Reconciliation `[implemented]` and investigations `[implemented]`

```
Import both CSVs
  → POST /reconciliation/runs
  → results: MATCHED | AMOUNT_MISMATCH | …
  → UI: /reconciliation (filter by outcome)
  → investigation propose → other user approves  [implemented]
```

Matcher details and teaching notes: [reconciliation-learning.md](reconciliation-learning.md).

Workspace isolation: every business query uses `user.workspaceId` from the membership load. A client-supplied workspace id is never the authority.

---

## 5. CSV import design `[implemented this pass]`

### Contracts

**Payments:** `payment_id, reference, gross_amount, fee_amount, currency, paid_at`  
**Bank:** `bank_entry_id, reference, settled_amount, currency, settled_at`

### Mapping

| CSV field | Database |
|---|---|
| `payment_id` | `payments.source_payment_id` |
| `gross_amount` / `fee_amount` | fils via exact decimal→integer conversion |
| `reference` | original + normalized |
| `paid_at` | `timestamptz` |
| `settled_at` | `date` |
| file bytes | SHA-256 → `import_batches.file_hash_sha256` |

### Behavior (all-or-nothing)

1. Auth required; workspace from token membership.
2. Reject if file > 1 MB or > 1000 data rows.
3. Parse with a maintained CSV parser (quoted commas allowed).
4. Validate headers and every row; collect row-level errors.
5. If any error → **400**, publish nothing.
6. If identical hash already published for this workspace/provider/kind → return existing batch summary, **no new canonical rows**.
7. If a source id already exists from a *different* file → reject the batch with a row error (do not silently overwrite).
8. Otherwise one PostgreSQL transaction: batch (`published`) + import_rows + payments or bank_entries.

**Why atomic?** Partial success would show a half-imported batch as “done” and break reconciliation totals. Staging then publish-all is clearer for a sprint. Partial acceptance is a later product choice with a different status.

**Alternative considered:** accept valid rows and quarantine invalid ones. Tradeoff: more operational complexity and ambiguous dashboards. Rejected for v1.

---

## 6. Authentication and security

### Authentication vs authorization

- **Authentication:** who are you? (login → JWT → user id)
- **Authorization:** what may you do? (role from `memberships`: analyst vs approver)

### JWT vs sessions — why JWT here

| | JWT (chosen) `[implemented]` | Server sessions |
|---|---|---|
| State | Token carries identity; server reloads membership | Server stores session id |
| API-first / curl / OpenAPI | Natural Bearer header | Needs cookie jar |
| CSRF | Not an issue for Bearer-only APIs | Cookies need CSRF defense |
| Logout | Client drops token; short expiry | Server can revoke immediately |
| Revocation | Harder without a denylist | Easy |

For this **local API-first sprint**, JWT with short expiry (`JWT_EXPIRES_IN`, default `1h`) is enough. Production may add refresh tokens or a denylist later.

**Login:** email + password → bcrypt compare → sign JWT `{ sub, workspaceId }`.  
**Logout:** client discards the token (no server endpoint required for the sprint).  
**Expiry:** `ignoreExpiration: false` in Passport JWT strategy.  
**Storage:** bcrypt hash in `users.password_hash`; never store plaintext.

### Protections

| Control | Status | Purpose |
|---|---|---|
| bcrypt password hashing | `[implemented]` | Slow hash resists stolen DB offline attacks |
| ValidationPipe whitelist | `[implemented]` | Drop/forbid unknown fields (forged `role`) |
| Parameterized Prisma queries | `[implemented]` | Prevent SQL injection |
| Workspace from membership | `[implemented]` | Tenant isolation |
| Upload 1 MB + CSV only | `[implemented]` | Bound CPU/memory and reject odd payloads |
| Safe auth errors | `[implemented]` | Same message for bad user/password |
| CORS for localhost UI | `[implemented]` | Allow future frontend origin |
| Secrets in `.env` (gitignored) | `[implemented]` | Keep `JWT_SECRET` / DB URL out of git |
| Rate limiting | `[planned]` | Slow brute-force login / upload floods |
| CSRF | N/A for Bearer | Required if we switch to cookie sessions |

---

## 7. Frontend design research

**Implemented now:** Vite + React app in `frontend/` with login, overview, payments, and CSV import. Matcher / unmatched screens remain `[planned]`.

Principles adopted, with sources:

1. **Balance-first / sparse hierarchy** — one primary number or status, then detail.  
   https://designpixil.com/blog/fintech-dashboard-design  
   https://www.wandr.studio/blog/fintech-dashboard-design

2. **Tabular numerals, right-aligned money, sticky table headers, 44–52px comfortable rows.**  
   https://cdn.jsdelivr.net/npm/@hegemonart/get-design-done@1.60.4/reference/domains/finance-patterns.md  
   https://uisea.net/fintech-dashboard-ui-kpis-card-patterns-tables-figma-guide/

3. **Readable type, ~120–145% line-height, designed empty/loading/error states.**  
   https://www.smashingmagazine.com/2023/10/choose-typefaces-fintech-products-best-practices-guide-part2/

4. **Light and dark themes as intentional tokens**, not an afterthought; color means state (shortfall), not decoration.

**Frontend how-to (when we build it):** requirements → user flows (login → upload → results → unmatched) → wireframes → design tokens → components → API integration → usability checks (keyboard, contrast, empty states).

Suggested stack for the empty `frontend/` folder later: Vite + React + TypeScript (keeps current folder layout; expansion roadmap may move to Next.js).

---

## 8. How to use Cursor and AI agents

Use AI as a **tutor and reviewer**, not as a black-box code dump.

### Good task shapes

| Goal | What to attach | Prompt shape |
|---|---|---|
| Plan | SPEC + PROGRESS | “Active day is Day 2 import. List endpoints and failure cases only.” |
| Implement | One module folder | “Add `POST /imports/payments` only. Follow SPEC all-or-nothing. Show the diff.” |
| Review | Diff or PR | “Challenge the transaction boundary and duplicate-hash handling.” |
| Debug | Error + failing test | “Predict the failure, then fix the smallest line.” |
| Design research | This guide §7 | “Summarize three table UX rules for AED amounts.” |

### Example prompts

```text
We are on Day 2 CSV import. Read docs/SPEC.md and prisma/schema.prisma.
Explain how payment_id maps to the database, then implement POST /imports/payments
with atomic publish. Do not build the matcher.
```

```text
Before changing code: why does one invalid CSV row reject the whole batch?
Then show the test that proves no payments were inserted.
```

### How you check results

1. Read the diff; explain unfamiliar lines out loud.
2. Run the named test or curl from PROGRESS.
3. Confirm FAIL cases (invalid CSV, replay) behave as predicted.
4. Update PROGRESS only with **verified** behavior.

### Product-level AI (separate)

RAG “Explain discrepancy” is an expansion feature (weeks 9–10). It is not part of Day 2. Keep SQL for amounts; use documents only for policy text.

---

## 9. Tradeoffs we accept

| Choice | Alternative | Why we accept this |
|---|---|---|
| Modular monolith Nest API | Microservices | One deployable for learning and portfolio |
| JWT Bearer | Cookie sessions | Simpler for curl/OpenAPI; CSRF deferred |
| Atomic CSV publish | Partial accept | Clear integrity for reconciliation |
| Sync import ≤1000 rows | Queues/BullMQ | Fits sprint; queues later |
| One workspace | Multi-tenant admin | Spec says fixed `ws_demo` |
| Frontend deferred this pass | UI alongside import | You chose backend-only; UI next |

---

## 10. Understanding checks

After import ships, answer without reading code:

1. Why does the JWT store `userId` but reload `role` from `memberships`?
2. Why does one bad CSV row discard the whole file?
3. What is the difference between `source_payment_id` and `reference`?

---

*Last updated with Day 2 CSV import pass. Export this Markdown to Word if you need a `.docx` for portfolio packaging.*
