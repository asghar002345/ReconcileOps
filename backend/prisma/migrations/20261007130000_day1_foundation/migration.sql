-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('analyst', 'approver');

-- CreateEnum
CREATE TYPE "ImportKind" AS ENUM ('payments', 'bank_entries');

-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('published', 'rejected');

-- CreateTable
CREATE TABLE "workspaces" (
    "id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" VARCHAR(30) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(120) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" VARCHAR(30) NOT NULL,
    "workspace_id" VARCHAR(64) NOT NULL,
    "user_id" VARCHAR(30) NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" VARCHAR(30) NOT NULL,
    "workspace_id" VARCHAR(64) NOT NULL,
    "provider_account_id" VARCHAR(64) NOT NULL,
    "kind" "ImportKind" NOT NULL,
    "status" "ImportBatchStatus" NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_hash_sha256" VARCHAR(64) NOT NULL,
    "row_count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" VARCHAR(30) NOT NULL,
    "batch_id" VARCHAR(30) NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "source_id" VARCHAR(120) NOT NULL,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" VARCHAR(30) NOT NULL,
    "workspace_id" VARCHAR(64) NOT NULL,
    "provider_account_id" VARCHAR(64) NOT NULL,
    "source_payment_id" VARCHAR(120) NOT NULL,
    "reference_original" VARCHAR(255) NOT NULL,
    "reference_normalized" VARCHAR(255) NOT NULL,
    "gross_amount_fils" BIGINT NOT NULL,
    "fee_amount_fils" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "paid_at" TIMESTAMPTZ(3) NOT NULL,
    "import_batch_id" VARCHAR(30),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_entries" (
    "id" VARCHAR(30) NOT NULL,
    "workspace_id" VARCHAR(64) NOT NULL,
    "provider_account_id" VARCHAR(64) NOT NULL,
    "source_bank_entry_id" VARCHAR(120) NOT NULL,
    "reference_original" VARCHAR(255) NOT NULL,
    "reference_normalized" VARCHAR(255) NOT NULL,
    "settled_amount_fils" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "settled_at" DATE NOT NULL,
    "import_batch_id" VARCHAR(30),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_workspace_id_user_id_key" ON "memberships"("workspace_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "import_batches_workspace_id_provider_account_id_kind_file_h_key" ON "import_batches"("workspace_id", "provider_account_id", "kind", "file_hash_sha256");

-- CreateIndex
CREATE UNIQUE INDEX "import_rows_batch_id_row_number_key" ON "import_rows"("batch_id", "row_number");

-- CreateIndex
CREATE INDEX "payments_workspace_id_provider_account_id_reference_normali_idx" ON "payments"("workspace_id", "provider_account_id", "reference_normalized", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "payments_workspace_id_provider_account_id_source_payment_id_key" ON "payments"("workspace_id", "provider_account_id", "source_payment_id");

-- CreateIndex
CREATE INDEX "bank_entries_workspace_id_provider_account_id_reference_nor_idx" ON "bank_entries"("workspace_id", "provider_account_id", "reference_normalized", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "bank_entries_workspace_id_provider_account_id_source_bank_e_key" ON "bank_entries"("workspace_id", "provider_account_id", "source_bank_entry_id");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_entries" ADD CONSTRAINT "bank_entries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_entries" ADD CONSTRAINT "bank_entries_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Reviewed integrity rules for Day 1 money and currency.
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_currency_aed_check" CHECK ("currency" = 'AED'),
  ADD CONSTRAINT "payments_gross_nonnegative_check" CHECK ("gross_amount_fils" >= 0),
  ADD CONSTRAINT "payments_fee_nonnegative_check" CHECK ("fee_amount_fils" >= 0),
  ADD CONSTRAINT "payments_fee_not_above_gross_check" CHECK ("fee_amount_fils" <= "gross_amount_fils");

ALTER TABLE "bank_entries"
  ADD CONSTRAINT "bank_entries_currency_aed_check" CHECK ("currency" = 'AED'),
  ADD CONSTRAINT "bank_entries_settled_nonnegative_check" CHECK ("settled_amount_fils" >= 0);

ALTER TABLE "import_batches"
  ADD CONSTRAINT "import_batches_row_count_nonnegative_check" CHECK ("row_count" >= 0);

ALTER TABLE "import_rows"
  ADD CONSTRAINT "import_rows_row_number_positive_check" CHECK ("row_number" > 0);
