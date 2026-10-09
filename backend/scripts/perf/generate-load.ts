/**
 * Week 11: generate synthetic load in workspace ws_perf (keeps ws_demo fast for e2e).
 *
 *   cd backend && npx tsx scripts/perf/generate-load.ts [--count=100000]
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const WORKSPACE_ID = 'ws_perf';
const PROVIDER = 'acct_paydemo_aed';
const BATCH = 2000;

function parseCount(): number {
  const arg = process.argv.find((value) => value.startsWith('--count='));
  if (!arg) return 100_000;
  const value = Number(arg.slice('--count='.length));
  if (!Number.isInteger(value) || value < 1000) {
    throw new Error('--count must be an integer >= 1000');
  }
  return value;
}

async function main(): Promise<void> {
  const count = parseCount();
  const started = Date.now();

  await prisma.workspace.upsert({
    where: { id: WORKSPACE_ID },
    update: { name: 'Perf load workspace' },
    create: { id: WORKSPACE_ID, name: 'Perf load workspace' },
  });

  const existing = await prisma.payment.count({
    where: { workspaceId: WORKSPACE_ID },
  });
  if (existing >= count) {
    console.log(
      `ws_perf already has ${existing} payments (>= ${count}); skipping generate.`,
    );
    return;
  }

  if (existing > 0) {
    console.log(`Clearing partial ws_perf load (${existing} payments)…`);
    await prisma.bankEntry.deleteMany({ where: { workspaceId: WORKSPACE_ID } });
    await prisma.payment.deleteMany({ where: { workspaceId: WORKSPACE_ID } });
  }

  console.log(`Generating ${count} payments + ~80% bank entries in ${WORKSPACE_ID}…`);

  for (let offset = 0; offset < count; offset += BATCH) {
    const size = Math.min(BATCH, count - offset);
    const payments = [];
    const banks = [];

    for (let i = 0; i < size; i += 1) {
      const n = offset + i + 1;
      const sourcePaymentId = `perf_pay_${n}`;
      const reference = `PREF-${n}`;
      const paidAt = new Date(Date.UTC(2026, 0, 1 + (n % 28), 10, 0, 0));
      const gross = 10000n + BigInt(n % 500);
      const fee = 300n;
      payments.push({
        id: `pp${String(n).padStart(10, '0')}`.slice(0, 30),
        workspaceId: WORKSPACE_ID,
        providerAccountId: PROVIDER,
        sourcePaymentId,
        referenceOriginal: reference,
        referenceNormalized: reference,
        grossAmountFils: gross,
        feeAmountFils: fee,
        currency: 'AED',
        paidAt,
      });

      // ~80% have a matching bank settlement inside the window
      if (n % 5 !== 0) {
        const expectedNet = gross - fee;
        const settled =
          n % 17 === 0 ? expectedNet - 300n : expectedNet; // occasional shortfall
        banks.push({
          id: `pb${String(n).padStart(10, '0')}`.slice(0, 30),
          workspaceId: WORKSPACE_ID,
          providerAccountId: PROVIDER,
          sourceBankEntryId: `perf_bank_${n}`,
          referenceOriginal: reference,
          referenceNormalized: reference,
          settledAmountFils: settled,
          currency: 'AED',
          settledAt: new Date(Date.UTC(2026, 0, 2 + (n % 3))),
        });
      }
    }

    await prisma.payment.createMany({ data: payments });
    if (banks.length > 0) {
      await prisma.bankEntry.createMany({ data: banks });
    }

    if ((offset / BATCH) % 10 === 0) {
      console.log(`  … ${offset + size}/${count}`);
    }
  }

  const payments = await prisma.payment.count({
    where: { workspaceId: WORKSPACE_ID },
  });
  const banks = await prisma.bankEntry.count({
    where: { workspaceId: WORKSPACE_ID },
  });
  console.log(
    `Done in ${((Date.now() - started) / 1000).toFixed(1)}s — payments=${payments} banks=${banks}`,
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
