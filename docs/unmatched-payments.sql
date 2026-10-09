-- Payments in ws_demo that have no bank entry sharing
-- workspace, provider account, normalized reference, and AED currency.
-- Run after migrate + seed:
--   psql "postgresql://reconcile:reconcile@127.0.0.1:5434/reconcileops" -f docs/unmatched-payments.sql

SELECT
  p.source_payment_id,
  p.reference_original,
  p.reference_normalized,
  p.gross_amount_fils,
  p.fee_amount_fils,
  p.paid_at
FROM payments AS p
WHERE p.workspace_id = 'ws_demo'
  AND p.provider_account_id = 'acct_paydemo_aed'
  AND p.currency = 'AED'
  AND NOT EXISTS (
    SELECT 1
    FROM bank_entries AS b
    WHERE b.workspace_id = p.workspace_id
      AND b.provider_account_id = p.provider_account_id
      AND b.reference_normalized = p.reference_normalized
      AND b.currency = p.currency
  )
ORDER BY p.source_payment_id;
