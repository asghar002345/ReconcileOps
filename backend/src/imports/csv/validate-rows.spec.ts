import { describe, expect, it } from 'vitest';
import { validatePaymentRecords } from './validate-rows.js';

describe('validatePaymentRecords', () => {
  it('accepts a valid row including a quoted-comma reference value', () => {
    const { rows, errors } = validatePaymentRecords([
      {
        payment_id: 'pay_imp_02',
        reference: 'REF, QUOTED',
        gross_amount: '50.00',
        fee_amount: '1.50',
        currency: 'AED',
        paid_at: '2026-10-01T11:00:00Z',
      },
    ]);

    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.referenceNormalized).toBe('REF, QUOTED');
    expect(rows[0]?.grossAmountFils).toBe(5000n);
  });

  it('collects a row error for an invalid amount and keeps the batch unpublished', () => {
    const { rows, errors } = validatePaymentRecords([
      {
        payment_id: 'pay_bad',
        reference: 'REF-BAD',
        gross_amount: '100.999',
        fee_amount: '3.00',
        currency: 'AED',
        paid_at: '2026-10-01T10:00:00Z',
      },
    ]);

    expect(rows).toEqual([]);
    expect(errors[0]).toMatchObject({
      rowNumber: 1,
      field: 'gross_amount',
    });
  });
});
