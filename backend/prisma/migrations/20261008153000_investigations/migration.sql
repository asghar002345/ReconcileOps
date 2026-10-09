-- CreateEnum
CREATE TYPE "InvestigationStatus" AS ENUM (
  'OPEN',
  'IN_PROGRESS',
  'PENDING_APPROVAL',
  'RESOLVED',
  'RETURNED_TO_REVIEW'
);

CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TYPE "DecisionKind" AS ENUM ('APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "investigations" (
  "id" VARCHAR(30) NOT NULL,
  "workspace_id" VARCHAR(64) NOT NULL,
  "reconciliation_result_id" VARCHAR(30) NOT NULL,
  "status" "InvestigationStatus" NOT NULL DEFAULT 'OPEN',
  "assigned_to_user_id" VARCHAR(30),
  "created_by_user_id" VARCHAR(30) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "investigations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "investigation_notes" (
  "id" VARCHAR(30) NOT NULL,
  "investigation_id" VARCHAR(30) NOT NULL,
  "author_user_id" VARCHAR(30) NOT NULL,
  "body" VARCHAR(2000) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "investigation_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "resolution_proposals" (
  "id" VARCHAR(30) NOT NULL,
  "investigation_id" VARCHAR(30) NOT NULL,
  "proposed_by_user_id" VARCHAR(30) NOT NULL,
  "summary" VARCHAR(2000) NOT NULL,
  "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "resolution_proposals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "resolution_decisions" (
  "id" VARCHAR(30) NOT NULL,
  "proposal_id" VARCHAR(30) NOT NULL,
  "decided_by_user_id" VARCHAR(30) NOT NULL,
  "decision" "DecisionKind" NOT NULL,
  "note" VARCHAR(2000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "resolution_decisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_events" (
  "id" VARCHAR(30) NOT NULL,
  "workspace_id" VARCHAR(64) NOT NULL,
  "actor_user_id" VARCHAR(30) NOT NULL,
  "action" VARCHAR(80) NOT NULL,
  "entity_type" VARCHAR(80) NOT NULL,
  "entity_id" VARCHAR(30) NOT NULL,
  "before_json" JSONB,
  "after_json" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "investigations_workspace_id_status_idx"
  ON "investigations"("workspace_id", "status");

CREATE INDEX "investigations_reconciliation_result_id_idx"
  ON "investigations"("reconciliation_result_id");

CREATE INDEX "investigation_notes_investigation_id_created_at_idx"
  ON "investigation_notes"("investigation_id", "created_at");

CREATE INDEX "resolution_proposals_investigation_id_status_idx"
  ON "resolution_proposals"("investigation_id", "status");

CREATE UNIQUE INDEX "resolution_decisions_proposal_id_key"
  ON "resolution_decisions"("proposal_id");

CREATE INDEX "audit_events_workspace_id_entity_type_entity_id_created_at_idx"
  ON "audit_events"("workspace_id", "entity_type", "entity_id", "created_at");

ALTER TABLE "investigations"
  ADD CONSTRAINT "investigations_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "investigations"
  ADD CONSTRAINT "investigations_reconciliation_result_id_fkey"
  FOREIGN KEY ("reconciliation_result_id") REFERENCES "reconciliation_results"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "investigation_notes"
  ADD CONSTRAINT "investigation_notes_investigation_id_fkey"
  FOREIGN KEY ("investigation_id") REFERENCES "investigations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "resolution_proposals"
  ADD CONSTRAINT "resolution_proposals_investigation_id_fkey"
  FOREIGN KEY ("investigation_id") REFERENCES "investigations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "resolution_decisions"
  ADD CONSTRAINT "resolution_decisions_proposal_id_fkey"
  FOREIGN KEY ("proposal_id") REFERENCES "resolution_proposals"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_events"
  ADD CONSTRAINT "audit_events_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- At most one PENDING proposal per investigation.
CREATE UNIQUE INDEX "resolution_proposals_one_pending_per_investigation"
  ON "resolution_proposals"("investigation_id")
  WHERE "status" = 'PENDING';
