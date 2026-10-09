# Build log

Running record of what we built, in order. Pair with [PROGRESS.md](PROGRESS.md) for verified status.

## Day 0 — Project shell

1. Created `frontend/` and `backend/` folders for ReconcileOps.
2. Scaffolded NestJS in `backend/`.
3. Stored the roadmap at `docs/ReconcileOps_Build_and_Learn_Roadmap.docx`.
4. Wrote module map in root `README.md`.

## Day 1 — Spec and foundation

5. Wrote `docs/SPEC.md` (fils, CSV contracts, roles, 3-day settlement window, match examples).
6. Added Docker Compose Postgres (host port **5434** on this machine).
7. Added `configuration` module: `validateEnv` for `DATABASE_URL` / `PORT`.
8. Added `GET /health` that runs `SELECT 1`.
9. Confirmed missing `DATABASE_URL` stops startup; downed DB returns 503.

## Day 1 — Schema and seed

10. Confirmed settlement window stays **3 days**.
11. Defined unmatched-payment columns and SQL in `docs/unmatched-payments.sql`.
12. Added Prisma 6 schema + reviewed SQL migration with CHECK constraints.
13. Seeded `ws_demo`, analyst, approver, SPEC payment/bank examples.
14. Wired Nest `DatabaseModule` / `PrismaService`.

## Day 1 — Identity

15. Added `JWT_SECRET` and `JWT_EXPIRES_IN` to env validation.
16. Built `identity` module: `POST /auth/login`, JWT, `JwtAuthGuard`, `GET /auth/me`.
17. JWT stores only `sub` + `workspaceId`; role is loaded from `memberships` on each request.
18. Verified: wrong password → 401; no token → 401; forged `role` on login → 400.

## Day 1 — Payments read slice

19. Built `payments` module: protected `GET /payments` with `page` / `pageSize`.
20. Workspace for the query comes from the authenticated membership, not from the client.
21. Fils amounts are returned as **strings** in JSON.
22. Added OpenAPI UI at `/docs`.
23. Tests cover unauthenticated 401, seeded list, and pagination.

## Day 2 — Design guide and CSV import (backend only)

24. Wrote [ReconcileOps-Design-and-Learning-Guide.md](ReconcileOps-Design-and-Learning-Guide.md): modules, schema, auth/security, deferred UI research, AI usage.
25. Built `imports` module: `POST /imports/payments`, `POST /imports/bank-entries`.
26. All-or-nothing validate → one transaction (`import_batches`, `import_rows`, canonical rows).
27. Duplicate file hash → HTTP 200 `reused: true`, no extra payments/bank rows.
28. Fixtures under `backend/test/fixtures/csv/`; unit + e2e coverage for valid, bad header, bad amount, replay.
29. Enabled CORS for future Vite/React localhost origins.

## Frontend shell (after Day 2 import)

30. Scaffolded Vite + React + TypeScript in `frontend/`.
31. Added API client, AuthContext (JWT in localStorage), light/dark theme tokens.
32. Screens: Login, Overview, Payments table, Import CSV with row-error feedback.
33. Typography: Source Serif 4 + IBM Plex Sans; tabular numerals for AED amounts.
34. `npm run build` verified for the initial frontend shell.

## Day 2 — Reconciliation matcher

35. Added tables `reconciliation_runs` / `reconciliation_results` (migration `20261008140000_reconciliation`).
36. Pure matcher in `matching.rules.ts` (`classifyWorkspace`) — unit-tested against SPEC examples.
37. Service loads workspace snapshot, runs matcher, stores a new run (rule `exact-ref-net-window-v1`).
38. API: `POST /reconciliation/runs`, `GET /reconciliation/runs/latest`, `GET /reconciliation/runs/:runId`.
39. Seeded ambiguous REF-500 (`pay_1005a` / `pay_1005b` / `bank_1005`).
40. Frontend Reconciliation page + Overview open-issue count.
41. Learning note: [reconciliation-learning.md](reconciliation-learning.md).

## Day 3 — Investigations / propose / approve / audit

42. Schema + migration `20261008153000_investigations`: investigations, notes, proposals, decisions, audit_events; partial unique one PENDING proposal per investigation.
43. Learning note: [investigations-learning.md](investigations-learning.md).
44. `investigations` module: create/list/detail/assign/notes/propose/decide.
45. Optimistic concurrency via `expectedVersion` → HTTP 409; decide+audit in one `$transaction`.
46. Role gates: analyst proposes; approver decides; cannot decide own proposal.
47. Unit + e2e coverage (propose/approve, analyst forbidden on decide, stale version).
48. Frontend: Investigations list/detail; Reconciliation **Investigate** action.

## Day 3 stretch — Simulated webhooks

49. Schema + migration `20261008170000_webhooks` (`webhook_events` with unique event id and business operation id).
50. Env: `WEBHOOK_HMAC_SECRET`, `WEBHOOK_TOLERANCE_SECONDS`; Nest `rawBody: true`.
51. `POST /webhooks/payments`: HMAC over `timestamp.rawBody`, freshness check, create payment + audit in one txn.
52. Idempotency: same eventId → `reused`; new eventId same businessOperationId → `reusedOperation`.
53. Learning note: [webhooks-learning.md](webhooks-learning.md). Unit + e2e (replay, concurrent, bad sig, stale ts).

## Week 7 — BullMQ imports and reconciliation

54. Added Redis service to `docker-compose.yml`; `REDIS_URL` env validation.
55. Migration `20261008180000_async_jobs`: `async_operations`, `outbox_events`.
56. API writes operation + outbox in one txn; returns **202** + `operationId`.
57. Worker process (`npm run start:worker`): outbox dispatcher → BullMQ → processors.
58. Imports: sync validate (400) then stage file + queue publish; hash reuse stays 200.
59. Reconciliation runs are always async; poll `GET /operations/:id`.
60. Learning note: [jobs-learning.md](jobs-learning.md). Frontend polls operations.

## Week 8 — Async webhook ingestion

61. Migration `20261008190000_webhook_async`: webhook statuses `accepted`/`failed`, nullable `processed_at`, `operation_id`, kind `webhook_payment_captured`.
62. Ingest path: HMAC verify → txn (`webhook_events` + `async_operations` + `outbox_events`) → HTTP 200 ack.
63. Worker job `webhook.payment_captured` applies payment + audit, marks webhook `processed`.
64. E2e updated for worker: sequential/concurrent replay, dual event ids, bad sig / stale ts.
65. Learning note updated: [webhooks-learning.md](webhooks-learning.md).

## Weeks 9–10 — Knowledge / Explain discrepancy

66. Switched Compose Postgres to `pgvector/pgvector:pg17`; migration enables `vector` and knowledge tables.
67. Demo policies under `docs/knowledge/demo-policies/` + 20 eval questions.
68. Ingest via seed (`demo-hash-v1` embeddings); Python split/embed exercise in `scripts/python/`.
69. `POST /investigations/:id/explain` — SQL evidence, pgvector top-5, structured explanation stored in `ai_explanations`.
70. Frontend Explain button on investigation detail; learning note [knowledge-learning.md](knowledge-learning.md).

## Week 11 — Performance

71. Migration `20261008210000_perf_indexes`: list + reconcile covering indexes.
72. Load generator `scripts/perf/generate-load.ts` → workspace `ws_perf` (~100k payments).
73. Benchmark `scripts/perf/benchmark.ts` → `docs/perf-results.md` (timings + EXPLAIN).
74. Keyset pagination on `GET /payments` (`cursorPaidAt` + `cursorSourcePaymentId`).
75. `TimingInterceptor` warns on HTTP ≥ 200ms; learning note [performance-learning.md](performance-learning.md).
