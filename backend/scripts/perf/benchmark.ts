/**
 * Week 11 benchmarks against ws_perf (run generate-load.ts first).
 *
 *   cd backend && npx tsx scripts/perf/benchmark.ts
 *
 * Writes docs/perf-results.md at the repo root.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { classifyWorkspace } from '../../src/reconciliation/matching.rules.js';

const prisma = new PrismaClient();
const WORKSPACE_ID = 'ws_perf';
const PROVIDER = 'acct_paydemo_aed';

async function timeMs(label: string, fn: () => Promise<unknown>): Promise<number> {
  const started = Date.now();
  await fn();
  const ms = Date.now() - started;
  console.log(`${label}: ${ms}ms`);
  return ms;
}

async function explainList(offset: number): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(
    `
    EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
    SELECT id, paid_at, source_payment_id
    FROM payments
    WHERE workspace_id = $1
    ORDER BY paid_at ASC, source_payment_id ASC
    OFFSET $2
    LIMIT 20
    `,
    WORKSPACE_ID,
    offset,
  );
  return rows.map((row) => row['QUERY PLAN']).join('\n');
}

async function explainKeyset(): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(
    `
    EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
    SELECT id, paid_at, source_payment_id
    FROM payments
    WHERE workspace_id = $1
      AND (
        paid_at > TIMESTAMPTZ '2026-01-15T10:00:00Z'
        OR (
          paid_at = TIMESTAMPTZ '2026-01-15T10:00:00Z'
          AND source_payment_id > 'perf_pay_50000'
        )
      )
    ORDER BY paid_at ASC, source_payment_id ASC
    LIMIT 20
    `,
    WORKSPACE_ID,
  );
  return rows.map((row) => row['QUERY PLAN']).join('\n');
}

async function main(): Promise<void> {
  const paymentCount = await prisma.payment.count({
    where: { workspaceId: WORKSPACE_ID },
  });
  if (paymentCount < 1000) {
    throw new Error(
      `ws_perf has only ${paymentCount} payments. Run: npx tsx scripts/perf/generate-load.ts`,
    );
  }

  console.log(`ws_perf payments=${paymentCount}`);

  const listPage1 = await timeMs('payments list OFFSET 0 LIMIT 20', () =>
    prisma.payment.findMany({
      where: { workspaceId: WORKSPACE_ID },
      orderBy: [{ paidAt: 'asc' }, { sourcePaymentId: 'asc' }],
      take: 20,
    }),
  );

  const listDeep = await timeMs('payments list OFFSET 50000 LIMIT 20', () =>
    prisma.payment.findMany({
      where: { workspaceId: WORKSPACE_ID },
      orderBy: [{ paidAt: 'asc' }, { sourcePaymentId: 'asc' }],
      skip: 50_000,
      take: 20,
    }),
  );

  const listKeyset = await timeMs('payments list keyset LIMIT 20', () =>
    prisma.payment.findMany({
      where: {
        workspaceId: WORKSPACE_ID,
        OR: [
          { paidAt: { gt: new Date('2026-01-15T10:00:00.000Z') } },
          {
            paidAt: new Date('2026-01-15T10:00:00.000Z'),
            sourcePaymentId: { gt: 'perf_pay_50000' },
          },
        ],
      },
      orderBy: [{ paidAt: 'asc' }, { sourcePaymentId: 'asc' }],
      take: 20,
    }),
  );

  const loadMs = await timeMs('load payments+banks for reconcile', async () => {
    await Promise.all([
      prisma.payment.findMany({
        where: {
          workspaceId: WORKSPACE_ID,
          providerAccountId: PROVIDER,
          currency: 'AED',
        },
      }),
      prisma.bankEntry.findMany({
        where: {
          workspaceId: WORKSPACE_ID,
          providerAccountId: PROVIDER,
          currency: 'AED',
        },
      }),
    ]);
  });

  const payments = await prisma.payment.findMany({
    where: {
      workspaceId: WORKSPACE_ID,
      providerAccountId: PROVIDER,
      currency: 'AED',
    },
  });
  const banks = await prisma.bankEntry.findMany({
    where: {
      workspaceId: WORKSPACE_ID,
      providerAccountId: PROVIDER,
      currency: 'AED',
    },
  });

  const classifyMs = await timeMs('classifyWorkspace (in-memory)', async () => {
    classifyWorkspace(
      payments.map((payment) => ({
        id: payment.id,
        sourcePaymentId: payment.sourcePaymentId,
        referenceNormalized: payment.referenceNormalized,
        grossAmountFils: payment.grossAmountFils,
        feeAmountFils: payment.feeAmountFils,
        paidAt: payment.paidAt,
      })),
      banks.map((bank) => ({
        id: bank.id,
        sourceBankEntryId: bank.sourceBankEntryId,
        referenceNormalized: bank.referenceNormalized,
        settledAmountFils: bank.settledAmountFils,
        settledAt: bank.settledAt,
      })),
    );
  });

  const planOffset0 = await explainList(0);
  const planOffset50k = await explainList(50_000);
  const planKeyset = await explainKeyset();

  const report = `# Perf results (Week 11)

Generated: ${new Date().toISOString()}

## Dataset

| Metric | Value |
|---|---|
| Workspace | \`ws_perf\` |
| Payments | ${paymentCount} |
| Bank entries | ${banks.length} |

## Timings (this machine)

| Operation | ms |
|---|---|
| List OFFSET 0 / 20 | ${listPage1} |
| List OFFSET 50000 / 20 | ${listDeep} |
| List keyset / 20 | ${listKeyset} |
| Load snapshot for reconcile | ${loadMs} |
| classifyWorkspace in memory | ${classifyMs} |

**Target (project):** page-1 list under ~200ms cold on this synthetic set; deep OFFSET may stay slower — prefer keyset.

## EXPLAIN (ANALYZE, BUFFERS) — OFFSET 0

\`\`\`
${planOffset0}
\`\`\`

## EXPLAIN — OFFSET 50000

\`\`\`
${planOffset50k}
\`\`\`

## EXPLAIN — keyset

\`\`\`
${planKeyset}
\`\`\`

## Indexes applied

- \`payments (workspace_id, paid_at, source_payment_id)\`
- \`payments (workspace_id, provider_account_id, currency)\`
- \`bank_entries (workspace_id, provider_account_id, currency)\`

## Notes

- Load lives in \`ws_perf\` so \`ws_demo\` e2e stays small.
- Reconciliation cost is dominated by loading rows + CPU classify; set-based SQL matching is a later optimization.
`;

  const out = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../docs/perf-results.md',
  );
  await writeFile(out, report, 'utf8');
  console.log(`Wrote ${out}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
