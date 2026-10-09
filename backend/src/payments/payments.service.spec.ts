import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentsService } from './payments.service.js';

describe('PaymentsService', () => {
  let prisma: {
    payment: {
      count: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let service: PaymentsService;

  beforeEach(() => {
    prisma = {
      payment: {
        count: vi.fn(),
        findMany: vi.fn(),
      },
      $transaction: vi.fn(async (ops: unknown[]) => {
        const results = [];
        for (const op of ops as Array<Promise<unknown>>) {
          results.push(await op);
        }
        return results;
      }),
    };
    service = new PaymentsService(prisma as never);
  });

  it('lists with offset pagination', async () => {
    prisma.payment.count.mockResolvedValue(2);
    prisma.payment.findMany.mockResolvedValue([
      {
        id: 'p1',
        workspaceId: 'ws_demo',
        providerAccountId: 'acct_paydemo_aed',
        sourcePaymentId: 'pay_1001',
        referenceOriginal: 'REF-100',
        referenceNormalized: 'REF-100',
        grossAmountFils: 10000n,
        feeAmountFils: 300n,
        currency: 'AED',
        paidAt: new Date('2026-10-01T10:00:00.000Z'),
      },
    ]);

    const page = await service.listPayments({
      workspaceId: 'ws_demo',
      page: 1,
      pageSize: 20,
    });

    expect(page.mode).toBe('offset');
    expect(page.items[0]?.grossAmountFils).toBe('10000');
    expect(page.totalItems).toBe(2);
  });

  it('lists with keyset cursor without counting totals', async () => {
    prisma.payment.findMany.mockResolvedValue([
      {
        id: 'p2',
        workspaceId: 'ws_demo',
        providerAccountId: 'acct_paydemo_aed',
        sourcePaymentId: 'pay_1002',
        referenceOriginal: 'REF-200',
        referenceNormalized: 'REF-200',
        grossAmountFils: 10000n,
        feeAmountFils: 300n,
        currency: 'AED',
        paidAt: new Date('2026-10-01T11:00:00.000Z'),
      },
    ]);

    const page = await service.listPayments({
      workspaceId: 'ws_demo',
      page: 1,
      pageSize: 20,
      cursorPaidAt: '2026-10-01T10:00:00.000Z',
      cursorSourcePaymentId: 'pay_1001',
    });

    expect(page.mode).toBe('keyset');
    expect(page.totalItems).toBe(-1);
    expect(page.nextCursor?.sourcePaymentId).toBe('pay_1002');
    expect(prisma.payment.count).not.toHaveBeenCalled();
  });
});
