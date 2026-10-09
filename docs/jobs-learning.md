# Learning note: Async jobs (Week 7)

## Why this exists

CSV import and reconciliation can outlive a single HTTP request. Week 7 moves that work off the request thread:

1. API writes an **async operation** + **outbox row** in one PostgreSQL transaction and returns **202** with an `operationId`.
2. A **dispatcher** (in the worker process) reads pending outbox rows and enqueues BullMQ jobs.
3. A **worker** runs the job, updates the operation to `succeeded` / `failed`, and never holds a DB transaction open across file parsing.

PostgreSQL and Redis do **not** share a transaction. The outbox is the bridge: if Redis is down, the row stays `pending` and is dispatched after recovery.

## States

```
queued → running → succeeded
                 → failed → (manual retry → queued)
```

## Idempotency

- BullMQ `jobId` = outbox event id (duplicate enqueue is safe).
- Worker no-ops if the operation is already `succeeded`.
- Import file-hash reuse can still short-circuit **before** enqueue (HTTP 200, no job).

## Processes

| Process | Command | Role |
|---|---|---|
| API | `npm run start:dev` | Accept uploads / enqueue / poll |
| Worker | `npm run start:worker` | Dispatch outbox + process jobs |

## API

| Method | Path | Meaning |
|---|---|---|
| `POST` | `/reconciliation/runs` | 202 + `operationId` |
| `POST` | `/imports/payments` | 202 queued, or 200 reused |
| `POST` | `/imports/bank-entries` | 202 queued, or 200 reused |
| `POST` | `/webhooks/payments` | 200 accepted + outbox (HMAC; worker applies payment) |
| `GET` | `/operations/:id` | Poll status / result |
| `POST` | `/operations/:id/retry` | Re-queue a failed operation |

## Understanding questions

1. What happens if Postgres commits the outbox but Redis is down?
2. Why must the worker check operation status before creating a second reconciliation run?
3. Why not keep a SQL transaction open while parsing a large CSV?
