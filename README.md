# ReconcileOps

ReconcileOps is a payment reconciliation and investigation prototype. It imports payment and bank-settlement CSVs (AED) and matches them deterministically. Every discrepancy it can't match becomes an investigation, and a resolution only goes through after a second person approves it.

> **Status:** prototype using demo data. It is not used in production. Multi-tenant administration, a real embedding/LLM provider and AWS deployment are **planned**.

**Live demo frontend:** https://reconcile-ops.vercel.app (the API runs on Render's free tier, so the first request may be slow).

## Features
- **Auth:** JWT login (Passport) for seeded demo users with two roles, analyst and approver. Roles and actor ids come from the server, never from the request body.
- **CSV import:** two fixed formats, payments and bank entries. Every row is validated before anything is published. An invalid batch is rejected with row-level errors, and the batch is committed atomically. File hashes and source ids make re-imports idempotent. Amounts are stored as integer fils (`BIGINT`).
- **Deterministic matching:** one-to-one matching on workspace, provider account, normalized reference, currency and a settlement window. Possible outcomes are `MATCHED`, `AMOUNT_MISMATCH`, `PAYMENT_WITHOUT_BANK_ENTRY`, `BANK_ENTRY_WITHOUT_PAYMENT`, `AMBIGUOUS` and `OUTSIDE_SETTLEMENT_WINDOW`. Database constraints allow only one active match per record.
- **Investigations:** assign an investigation, add notes, propose a resolution, then approve or reject it. The approver must be a different user from the proposer.
- **Webhooks:** simulated `payment.captured` ingest. Each request is checked for timestamp freshness and an HMAC-SHA256 signature (timing-safe compare), and duplicate deliveries are handled idempotently.
- **Async jobs:** a transactional outbox feeds BullMQ (Redis), and a separate worker process handles imports and reconciliation runs. `GET /operations/:id` reports status, and failed jobs can be retried.
- **Discrepancy explanation (demo):** `POST /investigations/:id/explain` returns a structured explanation: facts, possible causes, missing evidence, next steps and citations. It takes the amounts from SQL and pulls policy chunks from pgvector. Embeddings come from a deterministic local hash (`demo-hash-v1`). No external AI model is called.
- **Audit trail:** state changes are recorded as audit events.
- **Performance work:** keyset pagination on `GET /payments`, performance indexes, a slow-request logging interceptor, and load/EXPLAIN benchmark scripts (`docs/perf-results.md`).
- **Frontend:** a Vite + React + React Router app with login, overview, payments, import, reconciliation and investigation pages.

## Architecture
| Path | Contents |
|---|---|
| `backend/` | NestJS API (`npm run start`) and worker (`npm run start:worker`). Prisma schema and migrations live in `backend/prisma`. |
| `frontend/` | Vite React app |
| `docker-compose.yml` | PostgreSQL 17 + pgvector (port 5434) and Redis 7 (port 6379) for local development |
| `render.yaml` | Render Blueprint: API, PostgreSQL, Key Value |
| `scripts/python/` | Optional policy-ingest helper |
| `docs/` | Spec, design notes, deploy guide, performance results |

## Tech stack
NestJS 11, TypeScript, Prisma, PostgreSQL (pgvector), Redis + BullMQ, Passport-JWT, class-validator, Swagger/OpenAPI, Vitest + Supertest, React, Vite, oxlint.

## Running locally
```bash
docker compose up -d
cd backend
cp .env.example .env   # set DATABASE_URL, REDIS_URL, JWT_SECRET, WEBHOOK_HMAC_SECRET
npm install
npx prisma migrate deploy && npx prisma db seed
npm run start:dev       # API
npm run start:worker    # worker (second terminal)
cd ../frontend && npm install && npm run dev
```

## Tests
- Backend: unit tests (`*.spec.ts`) and e2e tests in `backend/test/` covering auth, imports, payments, reconciliation, investigations, webhooks and knowledge.
- Frontend: unit tests for formatting, upload validation, safe redirects and token storage.

## Deployment
The API, PostgreSQL and Redis run on Render (`render.yaml`), and the frontend runs on Vercel. The background worker needs a paid Render plan or a local run. See `docs/DEPLOY.md`.

## Planned
- Multi-tenant workspace administration
- Real embedding model and LLM provider for explanations
- Set-based SQL matcher
- AWS deployment and a real APM metrics backend
- `apps/web`, `apps/api`, `apps/worker` layout

## License
TODO: add a license.
