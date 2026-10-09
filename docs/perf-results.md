# Perf results (Week 11)

Generated: 2026-10-08T13:48:59.429Z

## Dataset

| Metric | Value |
|---|---|
| Workspace | `ws_perf` |
| Payments | 10000 |
| Bank entries | 8000 |

## Timings (this machine)

| Operation | ms |
|---|---|
| List OFFSET 0 / 20 | 71 |
| List OFFSET 50000 / 20 | 36 |
| List keyset / 20 | 22 |
| Load snapshot for reconcile | 671 |
| classifyWorkspace in memory | 117 |

**Target (project):** page-1 list under ~200ms cold on this synthetic set; deep OFFSET may stay slower — prefer keyset.

This capture used `--count=10000` for a fast local run. Re-run `npm run perf:generate` (default 100k) then `npm run perf:bench` for the full Week 11 dataset. Note: OFFSET 50000 on a 10k table returns 0 rows quickly — that timing is not a deep-page cost.

## EXPLAIN (ANALYZE, BUFFERS) — OFFSET 0

```
Limit  (cost=0.29..2.25 rows=20 width=34) (actual time=0.621..0.704 rows=20 loops=1)
  Buffers: shared hit=15
  ->  Index Scan using payments_workspace_id_paid_at_source_payment_id_idx on payments  (cost=0.29..974.27 rows=9892 width=34) (actual time=0.620..0.700 rows=20 loops=1)
        Index Cond: ((workspace_id)::text = 'ws_perf'::text)
        Buffers: shared hit=15
Planning:
  Buffers: shared hit=16
Planning Time: 0.824 ms
Execution Time: 0.990 ms
```

## EXPLAIN — OFFSET 50000

```
Limit  (cost=974.27..974.37 rows=1 width=34) (actual time=19.754..19.755 rows=0 loops=1)
  Buffers: shared hit=6173
  ->  Index Scan using payments_workspace_id_paid_at_source_payment_id_idx on payments  (cost=0.29..974.27 rows=9892 width=34) (actual time=0.249..17.721 rows=10000 loops=1)
        Index Cond: ((workspace_id)::text = 'ws_perf'::text)
        Buffers: shared hit=6173
Planning Time: 0.346 ms
Execution Time: 19.780 ms
```

## EXPLAIN — keyset

```
Limit  (cost=0.29..4.80 rows=20 width=34) (actual time=4.435..4.455 rows=20 loops=1)
  Buffers: shared hit=3199
  ->  Index Scan using payments_workspace_id_paid_at_source_payment_id_idx on payments  (cost=0.29..1048.46 rows=4640 width=34) (actual time=4.433..4.450 rows=20 loops=1)
        Index Cond: ((workspace_id)::text = 'ws_perf'::text)
        Filter: ((paid_at > '2026-01-15 10:00:00+00'::timestamp with time zone) OR ((paid_at = '2026-01-15 10:00:00+00'::timestamp with time zone) AND ((source_payment_id)::text > 'perf_pay_50000'::text)))
        Rows Removed by Filter: 5161
        Buffers: shared hit=3199
Planning:
  Buffers: shared hit=6
Planning Time: 0.572 ms
Execution Time: 4.503 ms
```

## Indexes applied

- `payments (workspace_id, paid_at, source_payment_id)`
- `payments (workspace_id, provider_account_id, currency)`
- `bank_entries (workspace_id, provider_account_id, currency)`

## Notes

- Load lives in `ws_perf` so `ws_demo` e2e stays small.
- Reconciliation cost is dominated by loading rows + CPU classify; set-based SQL matching is a later optimization.
