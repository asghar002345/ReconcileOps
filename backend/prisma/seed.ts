import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { seedKnowledgeCorpus } from '../src/knowledge/seed-corpus.js';

const prisma = new PrismaClient();

const WORKSPACE_ID = 'ws_demo';
const PROVIDER_ACCOUNT_ID = 'acct_paydemo_aed';
/** Demo password for both seeded users until identity login is wired. */
const DEMO_PASSWORD = 'Password123!';

function normalizeReference(value: string): string {
  return value.trim().toUpperCase();
}

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  await prisma.workspace.upsert({
    where: { id: WORKSPACE_ID },
    update: { name: 'Demo workspace' },
    create: { id: WORKSPACE_ID, name: 'Demo workspace' },
  });

  const analyst = await prisma.user.upsert({
    where: { email: 'analyst@demo.reconcileops.local' },
    update: {
      displayName: 'Demo Analyst',
      passwordHash,
    },
    create: {
      email: 'analyst@demo.reconcileops.local',
      displayName: 'Demo Analyst',
      passwordHash,
    },
  });

  const approver = await prisma.user.upsert({
    where: { email: 'approver@demo.reconcileops.local' },
    update: {
      displayName: 'Demo Approver',
      passwordHash,
    },
    create: {
      email: 'approver@demo.reconcileops.local',
      displayName: 'Demo Approver',
      passwordHash,
    },
  });

  await prisma.membership.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: WORKSPACE_ID,
        userId: analyst.id,
      },
    },
    update: { role: 'analyst' },
    create: {
      workspaceId: WORKSPACE_ID,
      userId: analyst.id,
      role: 'analyst',
    },
  });

  await prisma.membership.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: WORKSPACE_ID,
        userId: approver.id,
      },
    },
    update: { role: 'approver' },
    create: {
      workspaceId: WORKSPACE_ID,
      userId: approver.id,
      role: 'approver',
    },
  });

  const paymentBatchHash = createHash('sha256')
    .update('seed-payments-v1')
    .digest('hex');
  const bankBatchHash = createHash('sha256')
    .update('seed-bank-entries-v1')
    .digest('hex');

  const paymentBatch = await prisma.importBatch.upsert({
    where: {
      workspaceId_providerAccountId_kind_fileHashSha256: {
        workspaceId: WORKSPACE_ID,
        providerAccountId: PROVIDER_ACCOUNT_ID,
        kind: 'payments',
        fileHashSha256: paymentBatchHash,
      },
    },
    update: {},
    create: {
      workspaceId: WORKSPACE_ID,
      providerAccountId: PROVIDER_ACCOUNT_ID,
      kind: 'payments',
      status: 'published',
      fileName: 'seed-payments.csv',
      fileHashSha256: paymentBatchHash,
      rowCount: 6,
    },
  });

  const bankBatch = await prisma.importBatch.upsert({
    where: {
      workspaceId_providerAccountId_kind_fileHashSha256: {
        workspaceId: WORKSPACE_ID,
        providerAccountId: PROVIDER_ACCOUNT_ID,
        kind: 'bank_entries',
        fileHashSha256: bankBatchHash,
      },
    },
    update: {},
    create: {
      workspaceId: WORKSPACE_ID,
      providerAccountId: PROVIDER_ACCOUNT_ID,
      kind: 'bank_entries',
      status: 'published',
      fileName: 'seed-bank-entries.csv',
      fileHashSha256: bankBatchHash,
      rowCount: 5,
    },
  });

  const payments = [
    {
      sourcePaymentId: 'pay_1001',
      reference: 'REF-100',
      grossAmountFils: 10000n,
      feeAmountFils: 300n,
      paidAt: new Date('2026-10-01T10:00:00.000Z'),
    },
    {
      sourcePaymentId: 'pay_1002',
      reference: 'REF-200',
      grossAmountFils: 10000n,
      feeAmountFils: 300n,
      paidAt: new Date('2026-10-01T10:00:00.000Z'),
    },
    {
      // Unmatched example: no bank row shares REF-300.
      sourcePaymentId: 'pay_1003',
      reference: 'REF-300',
      grossAmountFils: 5000n,
      feeAmountFils: 100n,
      paidAt: new Date('2026-10-01T10:00:00.000Z'),
    },
    {
      // Ambiguous with pay_1005b.
      sourcePaymentId: 'pay_1005a',
      reference: 'REF-500',
      grossAmountFils: 10000n,
      feeAmountFils: 300n,
      paidAt: new Date('2026-10-01T10:00:00.000Z'),
    },
    {
      sourcePaymentId: 'pay_1005b',
      reference: 'REF-500',
      grossAmountFils: 10000n,
      feeAmountFils: 300n,
      paidAt: new Date('2026-10-01T10:00:00.000Z'),
    },
    {
      sourcePaymentId: 'pay_1006',
      reference: 'REF-600',
      grossAmountFils: 10000n,
      feeAmountFils: 300n,
      paidAt: new Date('2026-10-01T10:00:00.000Z'),
    },
  ] as const;

  for (const payment of payments) {
    await prisma.payment.upsert({
      where: {
        workspaceId_providerAccountId_sourcePaymentId: {
          workspaceId: WORKSPACE_ID,
          providerAccountId: PROVIDER_ACCOUNT_ID,
          sourcePaymentId: payment.sourcePaymentId,
        },
      },
      update: {
        referenceOriginal: payment.reference,
        referenceNormalized: normalizeReference(payment.reference),
        grossAmountFils: payment.grossAmountFils,
        feeAmountFils: payment.feeAmountFils,
        currency: 'AED',
        paidAt: payment.paidAt,
        importBatchId: paymentBatch.id,
      },
      create: {
        workspaceId: WORKSPACE_ID,
        providerAccountId: PROVIDER_ACCOUNT_ID,
        sourcePaymentId: payment.sourcePaymentId,
        referenceOriginal: payment.reference,
        referenceNormalized: normalizeReference(payment.reference),
        grossAmountFils: payment.grossAmountFils,
        feeAmountFils: payment.feeAmountFils,
        currency: 'AED',
        paidAt: payment.paidAt,
        importBatchId: paymentBatch.id,
      },
    });
  }

  const bankEntries = [
    {
      sourceBankEntryId: 'bank_1001',
      reference: 'REF-100',
      settledAmountFils: 9700n,
      settledAt: new Date('2026-10-02'),
    },
    {
      sourceBankEntryId: 'bank_1002',
      reference: 'REF-200',
      settledAmountFils: 9400n,
      settledAt: new Date('2026-10-02'),
    },
    {
      // Bank without payment example for later classification.
      sourceBankEntryId: 'bank_1004',
      reference: 'REF-400',
      settledAmountFils: 2500n,
      settledAt: new Date('2026-10-02'),
    },
    {
      // Ambiguous with two payments on REF-500.
      sourceBankEntryId: 'bank_1005',
      reference: 'REF-500',
      settledAmountFils: 9700n,
      settledAt: new Date('2026-10-02'),
    },
    {
      // Reference matches pay_1006; date is outside the 3-day window.
      sourceBankEntryId: 'bank_1006',
      reference: 'REF-600',
      settledAmountFils: 9700n,
      settledAt: new Date('2026-10-06'),
    },
  ] as const;

  for (const entry of bankEntries) {
    await prisma.bankEntry.upsert({
      where: {
        workspaceId_providerAccountId_sourceBankEntryId: {
          workspaceId: WORKSPACE_ID,
          providerAccountId: PROVIDER_ACCOUNT_ID,
          sourceBankEntryId: entry.sourceBankEntryId,
        },
      },
      update: {
        referenceOriginal: entry.reference,
        referenceNormalized: normalizeReference(entry.reference),
        settledAmountFils: entry.settledAmountFils,
        currency: 'AED',
        settledAt: entry.settledAt,
        importBatchId: bankBatch.id,
      },
      create: {
        workspaceId: WORKSPACE_ID,
        providerAccountId: PROVIDER_ACCOUNT_ID,
        sourceBankEntryId: entry.sourceBankEntryId,
        referenceOriginal: entry.reference,
        referenceNormalized: normalizeReference(entry.reference),
        settledAmountFils: entry.settledAmountFils,
        currency: 'AED',
        settledAt: entry.settledAt,
        importBatchId: bankBatch.id,
      },
    });
  }

  const knowledgeChunks = await seedKnowledgeCorpus(prisma);
  console.log(
    `Seeded workspace, users, memberships, SPEC rows, and ${knowledgeChunks} knowledge chunks.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
