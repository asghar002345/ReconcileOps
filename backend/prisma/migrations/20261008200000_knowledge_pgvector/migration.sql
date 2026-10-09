-- Week 9: pgvector + knowledge corpus + AI explanation store
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "knowledge_documents" (
  "id" VARCHAR(30) NOT NULL,
  "workspace_id" VARCHAR(64) NOT NULL,
  "provider_account_id" VARCHAR(64) NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "version" VARCHAR(64) NOT NULL,
  "source_url" VARCHAR(500),
  "effective_date" DATE NOT NULL,
  "content_hash" VARCHAR(64) NOT NULL,
  "is_demo_policy" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "document_chunks" (
  "id" VARCHAR(30) NOT NULL,
  "document_id" VARCHAR(30) NOT NULL,
  "workspace_id" VARCHAR(64) NOT NULL,
  "section" VARCHAR(255) NOT NULL,
  "content" TEXT NOT NULL,
  "content_hash" VARCHAR(64) NOT NULL,
  "embedding_model" VARCHAR(80) NOT NULL,
  "embedding" vector(64),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_explanations" (
  "id" VARCHAR(30) NOT NULL,
  "workspace_id" VARCHAR(64) NOT NULL,
  "investigation_id" VARCHAR(30) NOT NULL,
  "requested_by_user_id" VARCHAR(30) NOT NULL,
  "prompt_version" VARCHAR(64) NOT NULL,
  "model_version" VARCHAR(80) NOT NULL,
  "evidence_json" JSONB NOT NULL,
  "chunk_ids" TEXT[],
  "explanation_json" JSONB NOT NULL,
  "latency_ms" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_explanations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "knowledge_documents_workspace_id_provider_account_id_title_version_key"
  ON "knowledge_documents"("workspace_id", "provider_account_id", "title", "version");

CREATE UNIQUE INDEX "document_chunks_document_id_content_hash_key"
  ON "document_chunks"("document_id", "content_hash");

CREATE INDEX "document_chunks_workspace_id_idx"
  ON "document_chunks"("workspace_id");

CREATE INDEX "ai_explanations_workspace_id_investigation_id_created_at_idx"
  ON "ai_explanations"("workspace_id", "investigation_id", "created_at");

ALTER TABLE "knowledge_documents"
  ADD CONSTRAINT "knowledge_documents_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "document_chunks"
  ADD CONSTRAINT "document_chunks_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_explanations"
  ADD CONSTRAINT "ai_explanations_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
