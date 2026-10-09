-- CreateEnum
CREATE TYPE "AsyncOperationKind" AS ENUM (
  'reconciliation_run',
  'import_payments',
  'import_bank_entries'
);

CREATE TYPE "AsyncOperationStatus" AS ENUM (
  'queued',
  'running',
  'succeeded',
  'failed'
);

CREATE TYPE "OutboxStatus" AS ENUM ('pending', 'dispatched');

-- CreateTable
CREATE TABLE "async_operations" (
  "id" VARCHAR(30) NOT NULL,
  "workspace_id" VARCHAR(64) NOT NULL,
  "kind" "AsyncOperationKind" NOT NULL,
  "status" "AsyncOperationStatus" NOT NULL DEFAULT 'queued',
  "requested_by_user_id" VARCHAR(30) NOT NULL,
  "correlation_id" VARCHAR(64) NOT NULL,
  "result_json" JSONB,
  "error_message" VARCHAR(2000),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "started_at" TIMESTAMPTZ(3),
  "finished_at" TIMESTAMPTZ(3),

  CONSTRAINT "async_operations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbox_events" (
  "id" VARCHAR(30) NOT NULL,
  "workspace_id" VARCHAR(64) NOT NULL,
  "operation_id" VARCHAR(30) NOT NULL,
  "job_name" VARCHAR(80) NOT NULL,
  "payload_json" JSONB NOT NULL,
  "status" "OutboxStatus" NOT NULL DEFAULT 'pending',
  "dispatch_attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" VARCHAR(2000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dispatched_at" TIMESTAMPTZ(3),

  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "async_operations_workspace_id_created_at_idx"
  ON "async_operations"("workspace_id", "created_at");

CREATE UNIQUE INDEX "outbox_events_operation_id_key"
  ON "outbox_events"("operation_id");

CREATE INDEX "outbox_events_status_created_at_idx"
  ON "outbox_events"("status", "created_at");

ALTER TABLE "async_operations"
  ADD CONSTRAINT "async_operations_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "outbox_events"
  ADD CONSTRAINT "outbox_events_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "outbox_events"
  ADD CONSTRAINT "outbox_events_operation_id_fkey"
  FOREIGN KEY ("operation_id") REFERENCES "async_operations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
