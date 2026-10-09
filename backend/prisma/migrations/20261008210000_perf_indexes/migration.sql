-- Week 11: indexes justified by payments list ORDER BY and reconcile snapshot loads.
-- payments list: WHERE workspace_id ORDER BY paid_at, source_payment_id
CREATE INDEX IF NOT EXISTS "payments_workspace_id_paid_at_source_payment_id_idx"
  ON "payments"("workspace_id", "paid_at", "source_payment_id");

-- reconcile / imports load filters
CREATE INDEX IF NOT EXISTS "payments_workspace_id_provider_account_id_currency_idx"
  ON "payments"("workspace_id", "provider_account_id", "currency");

CREATE INDEX IF NOT EXISTS "bank_entries_workspace_id_provider_account_id_currency_idx"
  ON "bank_entries"("workspace_id", "provider_account_id", "currency");
