-- Extend webhook lifecycle for Week 8 async processing.
-- Enum ADD VALUE is committed separately from DEFAULT changes (PG txn rules).
ALTER TYPE "WebhookEventStatus" ADD VALUE IF NOT EXISTS 'accepted';
ALTER TYPE "WebhookEventStatus" ADD VALUE IF NOT EXISTS 'failed';

ALTER TYPE "AsyncOperationKind" ADD VALUE IF NOT EXISTS 'webhook_payment_captured';

ALTER TABLE "webhook_events"
  ALTER COLUMN "processed_at" DROP NOT NULL;

ALTER TABLE "webhook_events"
  ADD COLUMN IF NOT EXISTS "operation_id" VARCHAR(30);

CREATE INDEX IF NOT EXISTS "webhook_events_status_created_at_idx"
  ON "webhook_events"("status", "created_at");
