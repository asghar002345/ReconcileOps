# Investigations module

Human review cases opened from reconciliation discrepancies.

## Responsibilities

- Create / list / detail investigations
- Notes and assignment (analyst)
- Resolution proposals (analyst)
- Approve / reject with audit in one transaction (approver)
- Optimistic concurrency via `expectedVersion` → HTTP 409

## Does not

- Rewrite payment or bank evidence
- Change a reconciliation `outcome` (e.g. `AMOUNT_MISMATCH` stays)

## Learning

See `docs/investigations-learning.md`.
