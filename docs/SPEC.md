# ReconcileOps sprint specification

Ground truth for the three-day backend. Matcher code waits until these examples are the expected results of the tests. Decisions below are the working assumptions for this prototype.

## What this release does

One fixed workspace imports two AED CSV files, matches them deterministically, and lets an analyst propose a resolution that a different user approves. The original amounts stay in the database after approval.

Workspace: `ws_demo`. Provider account: `acct_paydemo_aed`. Currency: `AED` only.

## Money

Store AED as integer fils in PostgreSQL `BIGINT`. AED 100.00 is `10000` fils. One dirham is 100 fils.

CSV amounts are decimal strings with at most two decimal places (`100.00`, `3.00`). Convert by moving the decimal point. `94.00` becomes `9400`. Reject a third decimal place, a blank amount, and any value that is not a non-negative decimal.

For a simple sale, expected net is gross minus the reported fee.

```text
gross 10000 − fee 300 = expected net 9700
bank settled 9400
expected − actual = 300 fils short = AED 3.00
```

A later approval records a decision. It does not change the stored gross, fee, or settled amount, and it does not turn an amount mismatch into a match.

## CSV contracts

At most 1000 rows and 1 MB per file. Validate every row, then publish the batch in one transaction. One invalid row publishes nothing. The same file hash imported again creates no extra canonical payment or bank entry.

| Payment CSV | Bank CSV |
|---|---|
| `payment_id` | `bank_entry_id` |
| `reference` | `reference` |
| `gross_amount` | `settled_amount` |
| `fee_amount` | `currency` |
| `currency` | `settled_at` |
| `paid_at` | |

`payment_id` and `bank_entry_id` are source ids. They are unique inside this workspace and provider account. A `reference` is only a matching attribute. Store the original reference and a normalized one: trim, then uppercase. `ref-100` and `REF-100` normalize to the same value.

`paid_at` is a UTC timestamp. `settled_at` is a date-only settlement date. Keep both as given.

## Settlement window

**Confirmed for the sprint: 3 days.** Compare UTC calendar dates. A bank row is inside the window when its settlement date is on `paid_at`'s UTC date or on one of the next 3 calendar days.

`paid_at` of `2026-10-01T22:00:00Z` has UTC date `2026-10-01`. Settlement dates `2026-10-01` through `2026-10-04` are inside the window. `2026-10-05` is outside.

## Roles

| User | Role | May do |
|---|---|---|
| `analyst@demo.reconcileops.local` | analyst | List payments, open an investigation, add a note, propose a resolution |
| `approver@demo.reconcileops.local` | approver | Approve or reject a proposal |

The server reads the user id and role from the authenticated session. A role sent in the request body is ignored. The approver must be a different user from the person who proposed the resolution.

## Match results

One eligible payment and one eligible bank row, same workspace, provider account, normalized reference, and currency `AED`.

| Result | Rule |
|---|---|
| `MATCHED` | One pair, and expected net equals the settled amount, inside the window. |
| `AMOUNT_MISMATCH` | One pair inside the window, and the amounts differ. |
| `PAYMENT_WITHOUT_BANK_ENTRY` | A payment has no eligible bank row. |
| `BANK_ENTRY_WITHOUT_PAYMENT` | A bank row has no eligible payment. |
| `AMBIGUOUS` | More than one candidate on either side. Keep every candidate. Do not pick one. |
| `OUTSIDE_SETTLEMENT_WINDOW` | One reference candidate exists, and the date rule fails. |

## Examples

Amounts below are fils after conversion.

### 1. `MATCHED`

Payment `pay_1001`, reference `REF-100`, gross `10000`, fee `300`, paid `2026-10-01T10:00:00Z`.

Bank `bank_1001`, reference `REF-100`, settled `9700`, settled on `2026-10-02`.

Expected net `9700`. Difference `0`.

### 2. `AMOUNT_MISMATCH`

Payment `pay_1002`, reference `REF-200`, gross `10000`, fee `300`, paid `2026-10-01T10:00:00Z`.

Bank `bank_1002`, reference `REF-200`, settled `9400`, settled on `2026-10-02`.

Expected net `9700`. Actual `9400`. Shortfall `300` fils, which is AED 3.00.

### 3. `PAYMENT_WITHOUT_BANK_ENTRY`

Payment `pay_1003`, reference `REF-300`, gross `5000`, fee `100`, paid `2026-10-01T10:00:00Z`. No bank row uses `REF-300`.

### 4. `BANK_ENTRY_WITHOUT_PAYMENT`

Bank `bank_1004`, reference `REF-400`, settled `2500`, settled on `2026-10-02`. No payment uses `REF-400`.

### 5. `AMBIGUOUS`

Payments `pay_1005a` and `pay_1005b` both use reference `REF-500`. Bank `bank_1005` also uses `REF-500` and settled `9700` on `2026-10-02`.

Two payment candidates. Result is `AMBIGUOUS` even if one payment's net equals `9700`.

### 6. `OUTSIDE_SETTLEMENT_WINDOW`

Payment `pay_1006`, reference `REF-600`, gross `10000`, fee `300`, paid `2026-10-01T10:00:00Z`.

Bank `bank_1006`, reference `REF-600`, settled `9700`, settled on `2026-10-06`.

The amounts would match. The settlement date is 5 days after the paid date, past the 3-day window.

## Outside this specification

Redis, queues, webhooks, a second tenant, other currencies, combined payouts, fuzzy matching, and the frontend.
