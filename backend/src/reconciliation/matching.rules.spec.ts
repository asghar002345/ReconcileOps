import { describe, expect, it } from 'vitest';
import {
  classifyWorkspace,
  isInsideSettlementWindow,
  type BankCandidate,
  type PaymentCandidate,
} from './matching.rules.js';

function payment(
  partial: Partial<PaymentCandidate> & Pick<PaymentCandidate, 'id' | 'sourcePaymentId' | 'referenceNormalized'>,
): PaymentCandidate {
  return {
    grossAmountFils: 10000n,
    feeAmountFils: 300n,
    paidAt: new Date('2026-10-01T10:00:00.000Z'),
    ...partial,
  };
}

function bank(
  partial: Partial<BankCandidate> &
    Pick<BankCandidate, 'id' | 'sourceBankEntryId' | 'referenceNormalized'>,
): BankCandidate {
  return {
    settledAmountFils: 9700n,
    settledAt: new Date('2026-10-02T00:00:00.000Z'),
    ...partial,
  };
}

describe('isInsideSettlementWindow', () => {
  it('accepts paid day through paid day + 3', () => {
    const paid = new Date('2026-10-01T22:00:00.000Z');
    expect(isInsideSettlementWindow(paid, new Date('2026-10-01'))).toBe(true);
    expect(isInsideSettlementWindow(paid, new Date('2026-10-04'))).toBe(true);
    expect(isInsideSettlementWindow(paid, new Date('2026-10-05'))).toBe(false);
  });
});

describe('classifyWorkspace SPEC examples', () => {
  it('classifies MATCHED, AMOUNT_MISMATCH, missing sides, AMBIGUOUS, and window miss', () => {
    const payments = [
      payment({ id: 'p1', sourcePaymentId: 'pay_1001', referenceNormalized: 'REF-100' }),
      payment({ id: 'p2', sourcePaymentId: 'pay_1002', referenceNormalized: 'REF-200' }),
      payment({
        id: 'p3',
        sourcePaymentId: 'pay_1003',
        referenceNormalized: 'REF-300',
        grossAmountFils: 5000n,
        feeAmountFils: 100n,
      }),
      payment({ id: 'p5a', sourcePaymentId: 'pay_1005a', referenceNormalized: 'REF-500' }),
      payment({ id: 'p5b', sourcePaymentId: 'pay_1005b', referenceNormalized: 'REF-500' }),
      payment({ id: 'p6', sourcePaymentId: 'pay_1006', referenceNormalized: 'REF-600' }),
    ];
    const banks = [
      bank({ id: 'b1', sourceBankEntryId: 'bank_1001', referenceNormalized: 'REF-100' }),
      bank({
        id: 'b2',
        sourceBankEntryId: 'bank_1002',
        referenceNormalized: 'REF-200',
        settledAmountFils: 9400n,
      }),
      bank({
        id: 'b4',
        sourceBankEntryId: 'bank_1004',
        referenceNormalized: 'REF-400',
        settledAmountFils: 2500n,
      }),
      bank({ id: 'b5', sourceBankEntryId: 'bank_1005', referenceNormalized: 'REF-500' }),
      bank({
        id: 'b6',
        sourceBankEntryId: 'bank_1006',
        referenceNormalized: 'REF-600',
        settledAt: new Date('2026-10-06T00:00:00.000Z'),
      }),
    ];

    const byRef = Object.fromEntries(
      classifyWorkspace(payments, banks).map((row) => [
        row.referenceNormalized,
        row,
      ]),
    );

    expect(byRef['REF-100']?.outcome).toBe('MATCHED');
    expect(byRef['REF-200']?.outcome).toBe('AMOUNT_MISMATCH');
    expect(byRef['REF-200']?.differenceFils).toBe(-300n);
    expect(byRef['REF-300']?.outcome).toBe('PAYMENT_WITHOUT_BANK_ENTRY');
    expect(byRef['REF-400']?.outcome).toBe('BANK_ENTRY_WITHOUT_PAYMENT');
    expect(byRef['REF-500']?.outcome).toBe('AMBIGUOUS');
    expect(byRef['REF-500']?.paymentIds).toHaveLength(2);
    expect(byRef['REF-600']?.outcome).toBe('OUTSIDE_SETTLEMENT_WINDOW');
  });

  it('is deterministic for the same inputs', () => {
    const payments = [
      payment({ id: 'p1', sourcePaymentId: 'pay_1001', referenceNormalized: 'REF-100' }),
    ];
    const banks = [
      bank({ id: 'b1', sourceBankEntryId: 'bank_1001', referenceNormalized: 'REF-100' }),
    ];
    expect(classifyWorkspace(payments, banks)).toEqual(
      classifyWorkspace(payments, banks),
    );
  });
});
