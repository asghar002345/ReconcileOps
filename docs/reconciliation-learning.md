# Learning note: Reconciliation matcher

Read this after running `POST /reconciliation/runs`. It explains the design in plain language.

## What problem this solves

After CSV import, we have two lists:

- **payments** — what the provider says customers paid (gross, fee, paid time)
- **bank_entries** — what the bank says settled (amount, settlement date)

Reconciliation answers: for each normalized reference, do we have a unique pair, do the amounts agree, and is the settlement date inside the window?

## Why a pure function first?

`matching.rules.ts` → `classifyWorkspace(payments, bankEntries)` has **no database access**.

That lets us unit-test every SPEC example without Nest or Postgres. The service only loads rows, calls the function, and saves the run.

**Tradeoff:** loading all workspace rows into memory is fine for the sprint (≤1000 + seed). Large tenants later need set-based SQL or chunking.

## Rule version

Runs store `ruleVersion = exact-ref-net-window-v1`.

If we change the window from 3 days to 5, bump the version. Old runs stay meaningful; new runs use the new rule.

## Algorithm (precedence)

Group every payment and bank row by `reference_normalized`.

For each reference group:

1. **No payments, only banks** → one `BANK_ENTRY_WITHOUT_PAYMENT` per bank row.
2. **No banks, only payments** → one `PAYMENT_WITHOUT_BANK_ENTRY` per payment.
3. **More than one payment or more than one bank** → single `AMBIGUOUS` result listing all candidate ids. Never pick the first row.
4. **Exactly one payment and one bank:**
   - If settlement date outside paid UTC date … +3 days → `OUTSIDE_SETTLEMENT_WINDOW`.
   - Else if `gross - fee == settled` → `MATCHED`.
   - Else → `AMOUNT_MISMATCH` with `differenceFils = actual - expected` (AED 3 shortfall is `-300` fils when expected 9700 and actual 9400).

## Settlement window

Compare **UTC calendar dates**, not timestamps.

Paid `2026-10-01T22:00:00Z` → paid day `2026-10-01`.  
Inside: `2026-10-01` … `2026-10-04`.  
Outside: `2026-10-05` and later (SPEC example REF-600 uses `2026-10-06`).

## What we store

| Table | Purpose |
|---|---|
| `reconciliation_runs` | Who ran it, when, rule version, result count |
| `reconciliation_results` | One classification row: outcome, candidate ids, amounts, reason |

Results are a **snapshot**. Re-running creates a new run; it does not rewrite payments or bank entries. An approved investigation later must not turn an amount mismatch into a match by editing evidence.

## API

```http
POST /reconciliation/runs
Authorization: Bearer <token>

GET /reconciliation/runs/latest
GET /reconciliation/runs/:runId
```

Workspace always comes from the authenticated membership.

## How to verify yourself

```bash
cd backend
npm run prisma:seed
npm run test -- matching.rules.spec.ts
npm run test:e2e -- reconciliation.e2e-spec.ts
```

Or in the UI: open Overview → **Run reconciliation**.

## Understanding question

Why do we refuse to auto-match when two payments share one reference, even if one of them has the “right” net amount?
