-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('processed');

-- CreateTable
CREATE TABLE "webhook_events" (
  "id" VARCHAR(30) NOT NULL,
  "workspace_id" VARCHAR(64) NOT NULL,
  "provider_account_id" VARCHAR(64) NOT NULL,
  "event_id" VARCHAR(120) NOT NULL,
  "business_operation_id" VARCHAR(120) NOT NULL,
  "event_type" VARCHAR(80) NOT NULL,
  "status" "WebhookEventStatus" NOT NULL DEFAULT 'processed',
  "payload_json" JSONB NOT NULL,
  "payment_id" VARCHAR(30),
  "processed_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "webhook_events_workspace_id_provider_account_id_event_id_key"
  ON "webhook_events"("workspace_id", "provider_account_id", "event_id");

CREATE UNIQUE INDEX "webhook_events_workspace_id_provider_account_id_business_operation_id_key"
  ON "webhook_events"("workspace_id", "provider_account_id", "business_operation_id");

ALTER TABLE "webhook_events"
  ADD CONSTRAINT "webhook_events_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
