# ReconcileOps

Payment reconciliation and investigation platform. This repository follows [docs/ReconcileOps_Build_and_Learn_Roadmap.docx](docs/ReconcileOps_Build_and_Learn_Roadmap.docx).

The first release is a **backend prototype** for AED payment reconciliation: CSV import, deterministic matching, manual review, audit history, signed webhooks, and Week 7 async jobs (outbox + BullMQ). Multi-tenant administration, RAG, and AWS stay planned for expansion.

Track verified work in [docs/PROGRESS.md](docs/PROGRESS.md).

**Deploy:** backend on [Render](https://dashboard.render.com/) + frontend on [Vercel](https://vercel.com/) — see [docs/DEPLOY.md](docs/DEPLOY.md).

## Where the code lives

| Path | Role during the sprint |
|---|---|
| `backend/` | NestJS API + worker (`npm run start:worker`). |
| `frontend/` | Vite React app for login, payments, import, reconciliation, investigations. |
| `docs/` | Roadmap, progress, and later decisions. |
| `docker compose` | PostgreSQL/pgvector (5434) + Redis (6379). |
| `npm run perf:*` | Week 11 load (`ws_perf`) + EXPLAIN benchmarks. |

The expansion plan later uses `apps/web`, `apps/api`, and `apps/worker`. Leave the current layout in place until that phase starts.

## How we build, so the learning sticks

Each feature follows this cycle. We do not generate the whole application in one pass.

1. **Understand the problem.** You describe valid input, expected output, failure cases, and who is allowed to do it.
2. **Learn the one concept this feature needs.** Short explanation against this codebase, then a tiny exercise if it is still unclear.
3. **Describe your approach.** A few sentences on data flow, schema, and where the database transaction starts and ends. We review the tradeoff before writing the feature.
4. **Implement one piece.** One endpoint, one migration, or one service operation. You read the diff and can explain unfamiliar lines.
5. **Test a failure on purpose.** You predict the result first. Then we try it.
6. **Explain it back** without reading the code. We record the decision in `docs/PROGRESS.md` before the next feature.

You write the SQL, the matching rule, the permission check, and the transaction boundary. Scaffolding and repetitive DTO code can be generated after you have stated the approach.

A feature is finished when you can explain the data flow, name each important constraint, diagnose one failure, and name one alternative with its tradeoff.

## Modules, in the order we create them

Create a module when its first feature is built. Controllers stay thin: validate input, call the service, return the documented response.

### 1. `configuration` — Day 1

`backend/src/configuration`

Validates environment variables at startup and fails with a clear error when a required value is missing. This slice holds `PORT` and `DATABASE_URL`. Auth settings join it when identity is built. No feature module reads `process.env` on its own.

`GET /health` lives in `backend/src/health`. It is the setup probe: the process is up and PostgreSQL answered `SELECT 1`. It is not a business module.

**You should be able to explain:** why a missing database URL should stop the process before any request is served.

### 2. `database` — Day 1

`backend/src/database`

PostgreSQL via Docker Compose, Prisma for ordinary reads and writes, and reviewed SQL migrations for constraints. Starts the tables the current feature needs. Later tables wait until their feature is built.

Day 1 tables: fixed workspace, seeded users, import metadata, payments, bank entries.

**Money rule:** store AED as integer fils in `BIGINT` (`10000` = AED 100.00). Compare with exact arithmetic. Send large integers as strings in JSON.

**You should be able to explain:** why the database still needs `CHECK` and `UNIQUE` constraints when the API already validates the request. You write one unmatched-payment SQL query yourself.

### 3. `identity` — Day 1

`backend/src/identity`

Login for two seeded users: an analyst and a different approver. Uses a maintained auth library and expiring tokens. Roles and actor ids come from the server, never from a field the client sends.

Sprint permissions: analyst investigates and proposes; approver accepts or rejects. The approver must be a different user from the proposer.

**You should be able to explain:** how the API decides who the caller is, and why a request that claims `"role": "approver"` is ignored.

### 4. `payments` — Day 1 read slice

`backend/src/payments`

The first working endpoint: a protected, paginated list of seeded payments, described in OpenAPI. This is the slice you must be able to trace before Day 2: guard, DTO, controller, injected service, query, response.

**You should be able to explain:** why the service is injected, what the DTO validates, and what happens to a request with no token.

### 5. `imports` — Day 2

`backend/src/imports`

Imports two fixed AED CSV formats. Work stays synchronous and small.

| File | Columns |
|---|---|
| Payments | `payment_id`, `reference`, `gross_amount`, `fee_amount`, `currency`, `paid_at` |
| Bank entries | `bank_entry_id`, `reference`, `settled_amount`, `currency`, `settled_at` |

Limits for this release: about 1000 rows and 1 MB per file. Validate every row before publication. An invalid batch is rejected with row errors and publishes nothing. Store the file hash, raw rows, and source ids. Commit the batch atomically.

Source ids are unique inside the workspace and provider account. A reference is a matching attribute, not the payment's identity. Keep both the original reference and the normalized one. Importing the same file again does not create extra canonical records.

**You should be able to explain:** the difference between raw evidence and canonical records, why a repeated file is rejected or reused, and why a repeated reference is kept for review.

### 6. `reconciliation` — Day 2

`backend/src/reconciliation`

Deterministic one-to-one matching inside the workspace, provider account, normalized reference, AED currency, and a documented settlement window.

| Result | Meaning |
|---|---|
| `MATCHED` | One eligible pair, and expected net equals the bank amount. |
| `AMOUNT_MISMATCH` | One pair, amounts differ. |
| `PAYMENT_WITHOUT_BANK_ENTRY` | Payment has no bank evidence. |
| `BANK_ENTRY_WITHOUT_PAYMENT` | Bank row has no payment. |
| `AMBIGUOUS` | More than one candidate. Show the candidates. Do not pick the first row. |
| `OUTSIDE_SETTLEMENT_WINDOW` | A reference candidate exists, and the date rule fails. |

Expected net for a simple sale is gross minus the reported fee. The teaching case: AED 100 gross, AED 3 fee, bank received AED 94. Expected net is AED 97. Shortfall is AED 3. A reviewer can accept a documented resolution, and the original mismatch stays intact.

Each result stores input ids, rule version, reason, and amounts. Database constraints enforce one active match per payment and per bank entry, including when two runs happen together. Running the same inputs again yields the same classifications.

**You should be able to explain:** the join, the uniqueness rules, the transaction boundary, how a reference is normalized, and why ambiguous candidates are not auto-matched. You write or change the matching predicate yourself.

### 7. `investigations` — Day 3

`backend/src/investigations`

Open an investigation from a discrepancy, assign it, add a note, and submit a resolution proposal. A different seeded approver approves or rejects it. Proposals and decisions are stored separately from raw payment and bank evidence. Resolving a case does not rewrite a bank row or turn an amount mismatch into a match.

States: `OPEN`, `IN_PROGRESS`, `PENDING_APPROVAL`, `RESOLVED`, plus an explicit rejection or return-to-review transition.

Stale updates fail a version check or lock and return a conflict. The decision and the audit event commit in one transaction. The detail endpoint includes the audit timeline.

Audit fields: workspace, actor, action, entity type and id, timestamp, request id, and the relevant before/after values. Audit rows are append-only for the application role.

**You should be able to explain:** where the transaction begins and ends, why the analyst cannot approve their own proposal, and why a resolved case is still an amount mismatch.

### 8. `webhooks` — Week 8 `[implemented]`

`backend/src/webhooks`

`POST /webhooks/payments` accepts `payment.captured` only. Verifies HMAC over `timestamp.rawBody` and timestamp freshness. Persists `webhook_events` (**accepted**) + async operation + outbox in one transaction, then returns 200. The worker applies the payment + audit and marks the event **processed**. Same `eventId` or same `businessOperationId` → one business effect. Does not invent a bank settlement.

See [docs/webhooks-learning.md](docs/webhooks-learning.md). Requires `npm run start:worker`.

### 9. `knowledge` — Weeks 9–10 `[implemented]`

`backend/src/knowledge`

Demo policies → pgvector chunks (`demo-hash-v1`). `POST /investigations/:id/explain` loads SQL evidence, retrieves top policy sections, returns a structured explanation (facts / causes / next steps / citations). It does not approve cases or rewrite amounts. See [docs/knowledge-learning.md](docs/knowledge-learning.md).

## Sprint path

Build in this order. Start the next day only after you can explain the previous day without reading the code.

| Day | Modules | Done when |
|---|---|---|
| Before code | Specification | One-page spec plus five small reconciliation examples exist. These examples are the ground truth for tests. |
| Day 1 | configuration, database, identity, payments | A clean database migrates and seeds. `GET` payments works with a token. A request without a token is rejected. |
| Day 2 | imports, reconciliation | Both CSVs import. A repeat import adds no canonical rows. An invalid row publishes no batch. Reconciliation results trace back to source rows. |
| Day 3 | investigations | Import, reconcile, inspect a discrepancy, propose, approve as the other user, and read the audit history, all through documented API calls. |
| After the core checks | webhooks `[done]` | Same event ten times produces one business effect; dual delivery ids share one operation. |

The core chain to demonstrate:

`import → reconcile → inspect discrepancy → propose → approve → audit history`

Also show: replaying an import does not change totals, an analyst cannot approve, a person cannot approve their own proposal, and two concurrent decisions do not both succeed.

## Explicitly later

These are named in the roadmap and stay out of the sprint: Redis, BullMQ, pgvector, Python processing, RAG, multi-tenant membership administration, AWS, the Next.js app, combined payouts, fuzzy matching, multi-currency conversion, live bank APIs, and OCR.

## Session shape

For about 150 minutes: 30 learn, 80 build, 25 test a failure, 15 write down what changed and why. The task at the end of the session should be small enough to demonstrate.

## First task

The specification and six classification examples are in [docs/SPEC.md](docs/SPEC.md). Matcher code waits until you can state what each example returns.

Day 1 foundation plus Day 2 CSV import exist on the backend. Connect to Postgres at `127.0.0.1:5434` as user `reconcile` / password `reconcile`, database `reconcileops`. Run `npm run db:setup` from `backend/` after a clean checkout.

| Step | Call |
|---|---|
| Login | `POST /auth/login` — seeded emails, password `Password123!` |
| Who am I | `GET /auth/me` — Bearer token |
| Payments | `GET /payments?page=1&pageSize=20` — Bearer token |
| Import payments | `POST /imports/payments` — multipart field `file` + Bearer |
| Import bank | `POST /imports/bank-entries` — multipart field `file` + Bearer |
| Reconcile | `POST /reconciliation/runs` — Bearer |
| Latest run | `GET /reconciliation/runs/latest` — Bearer |
| OpenAPI | `http://127.0.0.1:3000/docs` |

Design and learning guide: [docs/ReconcileOps-Design-and-Learning-Guide.md](docs/ReconcileOps-Design-and-Learning-Guide.md). Progress: [docs/PROGRESS.md](docs/PROGRESS.md). Build steps: [docs/BUILD_LOG.md](docs/BUILD_LOG.md).

### Frontend

```bash
cd frontend
cp .env.example .env   # VITE_API_URL=http://127.0.0.1:3000
npm run dev            # http://127.0.0.1:5173
```

Screens: login, overview, payments, CSV import, reconciliation. Light/dark theme toggle in the shell.

Matcher learning note: [docs/reconciliation-learning.md](docs/reconciliation-learning.md).

Next: Day 3 investigations (propose / approve / audit).
