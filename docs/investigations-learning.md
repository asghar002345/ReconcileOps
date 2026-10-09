# Learning note: Investigations (Day 3)

## What this module is for

Reconciliation **classifies** a discrepancy. An investigation is a **human review case** about that classification.

Important: resolving a case **does not rewrite** payment or bank amounts, and it does **not** turn an `AMOUNT_MISMATCH` into a `MATCHED` result. Evidence stays; decisions are stored separately.

## States

```
OPEN → IN_PROGRESS → PENDING_APPROVAL → RESOLVED
                         ↓
                 RETURNED_TO_REVIEW → (propose again)
```

| Status | Meaning |
|---|---|
| `OPEN` | Case created from a discrepancy |
| `IN_PROGRESS` | Assigned / notes being added |
| `PENDING_APPROVAL` | A proposal is waiting |
| `RESOLVED` | Approver accepted the proposal |
| `RETURNED_TO_REVIEW` | Approver rejected; analyst can propose again |

## Roles

| Actor | May |
|---|---|
| `analyst` | Create investigation, assign, note, propose |
| `approver` | Approve or reject a proposal |

Rules enforced on the server:

1. Role comes from `memberships`, not the request body.
2. The approver must be a **different user** from the proposer (no self-approval).
3. An analyst cannot call the decide endpoint even if they send `"role":"approver"`.

## Optimistic concurrency (`version`)

Every investigation has an integer `version`.

Mutating calls send `expectedVersion`. If it does not match the row in the database, the API returns **409 Conflict**.

That stops two browsers from silently overwriting each other: only the first write wins; the second must reload.

## Transaction boundary on decide

When an approver decides, **one PostgreSQL transaction** must include:

1. Update proposal status  
2. Update investigation status + bump version  
3. Insert `resolution_decisions` row  
4. Insert `audit_events` row  

If the audit insert fails, the business update rolls back. You never get “approved but no audit.”

## Audit fields

`audit_events` stores: workspace, actor, action, entity type/id, before/after JSON, timestamp.

This is **append-only for the app role**, not tamper-proof against a database administrator.

## API map

| Method | Path | Who |
|---|---|---|
| `POST` | `/investigations` | analyst |
| `GET` | `/investigations` | any member |
| `GET` | `/investigations/:id` | any member (includes notes, proposals, audit) |
| `POST` | `/investigations/:id/notes` | analyst |
| `POST` | `/investigations/:id/assign` | analyst |
| `POST` | `/investigations/:id/proposals` | analyst |
| `POST` | `/investigations/:id/proposals/:proposalId/decide` | approver |

## Understanding questions

1. Why keep the original `AMOUNT_MISMATCH` after approval?  
2. Why put the audit write in the same transaction as the decision?  
3. What should happen if two approvers click Approve at the same time with the same `expectedVersion`?
