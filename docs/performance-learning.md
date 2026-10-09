# Learning note: Performance (Week 11)

## Goals

1. Load **~100k** synthetic payments (plus related bank rows) without slowing `ws_demo` e2e.
2. Measure list + reconcile cost; capture **EXPLAIN (ANALYZE, BUFFERS)**.
3. Add **justified** indexes and **keyset** pagination for deep pages.

## Dataset

| Workspace | Purpose |
|---|---|
| `ws_demo` | Spec seed + e2e (small) |
| `ws_perf` | Load generator target |

```bash
cd backend
npm run perf:generate          # default 100000
# or
npx tsx scripts/perf/generate-load.ts --count=10000
npm run perf:bench             # writes docs/perf-results.md
```

## Indexes added

| Index | Why |
|---|---|
| `payments (workspace_id, paid_at, source_payment_id)` | Matches `ORDER BY paid_at, source_payment_id` for lists |
| `payments (workspace_id, provider_account_id, currency)` | Matches reconcile snapshot filter |
| `bank_entries (workspace_id, provider_account_id, currency)` | Same for bank side |

The existing reference indexes remain for matching buckets.

## Offset vs keyset

- **Offset** (`page` / `pageSize`): simple; deep pages (`OFFSET 50000`) get slower because Postgres still walks skipped rows.
- **Keyset** (`cursorPaidAt` + `cursorSourcePaymentId`): seek to the next key; stays stable as the table grows.

```http
GET /payments?pageSize=20&cursorPaidAt=2026-01-15T10:00:00.000Z&cursorSourcePaymentId=perf_pay_50000
```

Keyset responses set `totalItems` / `totalPages` to `-1` (no exact count) and return `nextCursor`.

## Observability

`TimingInterceptor` logs any HTTP request ≥ 200ms as a warning (`HttpTiming`) so slow imports/reconcile polls show up in API logs.

## Understanding questions

1. Why can `OFFSET 50000` stay slow even with a perfect covering index?
2. Why put load in `ws_perf` instead of `ws_demo`?
3. When is counting `totalItems` on every page request a bad idea?
