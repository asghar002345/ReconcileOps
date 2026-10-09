-- CreateEnum
CREATE TYPE "ReconciliationOutcome" AS ENUM (
  'MATCHED',
  'AMOUNT_MISMATCH',
  'PAYMENT_WITHOUT_BANK_ENTRY',
  'BANK_ENTRY_WITHOUT_PAYMENT',
  'AMBIGUOUS',
  'OUTSIDE_SETTLEMENT_WINDOW'
);

-- CreateTable
CREATE TABLE "reconciliation_runs" (
  "id" VARCHAR(30) NOT NULL,
  "workspace_id" VARCHAR(64) NOT NULL,
  "provider_account_id" VARCHAR(64) NOT NULL,
  "rule_version" VARCHAR(64) NOT NULL,
  "created_by_user_id" VARCHAR(30) NOT NULL,
  "result_count" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reconciliation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_results" (
  "id" VARCHAR(30) NOT NULL,
  "run_id" VARCHAR(30) NOT NULL,
  "outcome" "ReconciliationOutcome" NOT NULL,
  "reference_normalized" VARCHAR(255) NOT NULL,
  "payment_ids" VARCHAR(30)[],
  "bank_entry_ids" VARCHAR(30)[],
  "expected_net_fils" BIGINT,
  "actual_settled_fils" BIGINT,
  "difference_fils" BIGINT,
  "reason" VARCHAR(500) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reconciliation_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reconciliation_runs_workspace_id_created_at_idx"
  ON "reconciliation_runs"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "reconciliation_results_run_id_outcome_idx"
  ON "reconciliation_results"("run_id", "outcome");

-- AddForeignKey
ALTER TABLE "reconciliation_runs"
  ADD CONSTRAINT "reconciliation_runs_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_results"
  ADD CONSTRAINT "reconciliation_results_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "reconciliation_runs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
