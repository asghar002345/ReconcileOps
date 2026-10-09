/** Bump when the matching algorithm changes. Stored on every run. */
export const RULE_VERSION = 'exact-ref-net-window-v1';

/** Paid UTC date plus this many following calendar days are inside the window. */
export const SETTLEMENT_WINDOW_EXTRA_DAYS = 3;

export type MatchOutcome =
  | 'MATCHED'
  | 'AMOUNT_MISMATCH'
  | 'PAYMENT_WITHOUT_BANK_ENTRY'
  | 'BANK_ENTRY_WITHOUT_PAYMENT'
  | 'AMBIGUOUS'
  | 'OUTSIDE_SETTLEMENT_WINDOW';

export type PaymentCandidate = {
  id: string;
  sourcePaymentId: string;
  referenceNormalized: string;
  grossAmountFils: bigint;
  feeAmountFils: bigint;
  paidAt: Date;
};

export type BankCandidate = {
  id: string;
  sourceBankEntryId: string;
  referenceNormalized: string;
  settledAmountFils: bigint;
  settledAt: Date;
};

export type MatchResultDraft = {
  outcome: MatchOutcome;
  referenceNormalized: string;
  paymentIds: string[];
  bankEntryIds: string[];
  expectedNetFils: bigint | null;
  actualSettledFils: bigint | null;
  differenceFils: bigint | null;
  reason: string;
};

export function expectedNetFils(
  grossAmountFils: bigint,
  feeAmountFils: bigint,
): bigint {
  return grossAmountFils - feeAmountFils;
}

/** UTC calendar date as YYYY-MM-DD. */
export function utcDateString(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

/**
 * Settlement date is inside the window when it falls on the payment's UTC
 * paid date or on one of the next SETTLEMENT_WINDOW_EXTRA_DAYS days.
 */
export function isInsideSettlementWindow(
  paidAt: Date,
  settledAt: Date,
  extraDays = SETTLEMENT_WINDOW_EXTRA_DAYS,
): boolean {
  const paidDay = utcDateString(paidAt);
  const settledDay = utcDateString(settledAt);
  const start = new Date(`${paidDay}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + extraDays);
  const settled = new Date(`${settledDay}T00:00:00.000Z`);
  return settled >= start && settled <= end;
}

/**
 * Deterministic exact-reference matcher.
 * Groups by normalized reference, then applies SPEC precedence.
 */
export function classifyWorkspace(
  payments: PaymentCandidate[],
  bankEntries: BankCandidate[],
): MatchResultDraft[] {
  const byReference = new Map<
    string,
    { payments: PaymentCandidate[]; banks: BankCandidate[] }
  >();

  for (const payment of payments) {
    const bucket = byReference.get(payment.referenceNormalized) ?? {
      payments: [],
      banks: [],
    };
    bucket.payments.push(payment);
    byReference.set(payment.referenceNormalized, bucket);
  }

  for (const bank of bankEntries) {
    const bucket = byReference.get(bank.referenceNormalized) ?? {
      payments: [],
      banks: [],
    };
    bucket.banks.push(bank);
    byReference.set(bank.referenceNormalized, bucket);
  }

  const results: MatchResultDraft[] = [];
  const references = [...byReference.keys()].sort();

  for (const reference of references) {
    const group = byReference.get(reference)!;
    const { payments: pays, banks } = group;

    if (pays.length === 0) {
      for (const bank of banks) {
        results.push({
          outcome: 'BANK_ENTRY_WITHOUT_PAYMENT',
          referenceNormalized: reference,
          paymentIds: [],
          bankEntryIds: [bank.id],
          expectedNetFils: null,
          actualSettledFils: bank.settledAmountFils,
          differenceFils: null,
          reason: `Bank entry ${bank.sourceBankEntryId} has no payment with reference ${reference}`,
        });
      }
      continue;
    }

    if (banks.length === 0) {
      for (const payment of pays) {
        results.push({
          outcome: 'PAYMENT_WITHOUT_BANK_ENTRY',
          referenceNormalized: reference,
          paymentIds: [payment.id],
          bankEntryIds: [],
          expectedNetFils: expectedNetFils(
            payment.grossAmountFils,
            payment.feeAmountFils,
          ),
          actualSettledFils: null,
          differenceFils: null,
          reason: `Payment ${payment.sourcePaymentId} has no bank entry with reference ${reference}`,
        });
      }
      continue;
    }

    if (pays.length > 1 || banks.length > 1) {
      results.push({
        outcome: 'AMBIGUOUS',
        referenceNormalized: reference,
        paymentIds: pays.map((p) => p.id),
        bankEntryIds: banks.map((b) => b.id),
        expectedNetFils: null,
        actualSettledFils: null,
        differenceFils: null,
        reason: `Reference ${reference} has ${pays.length} payment(s) and ${banks.length} bank entr(y/ies); not auto-matched`,
      });
      continue;
    }

    const payment = pays[0]!;
    const bank = banks[0]!;
    const expected = expectedNetFils(
      payment.grossAmountFils,
      payment.feeAmountFils,
    );
    const actual = bank.settledAmountFils;
    const difference = actual - expected;

    if (!isInsideSettlementWindow(payment.paidAt, bank.settledAt)) {
      results.push({
        outcome: 'OUTSIDE_SETTLEMENT_WINDOW',
        referenceNormalized: reference,
        paymentIds: [payment.id],
        bankEntryIds: [bank.id],
        expectedNetFils: expected,
        actualSettledFils: actual,
        differenceFils: difference,
        reason: `Settlement ${utcDateString(bank.settledAt)} is outside the ${SETTLEMENT_WINDOW_EXTRA_DAYS}-day window from paid ${utcDateString(payment.paidAt)}`,
      });
      continue;
    }

    if (expected === actual) {
      results.push({
        outcome: 'MATCHED',
        referenceNormalized: reference,
        paymentIds: [payment.id],
        bankEntryIds: [bank.id],
        expectedNetFils: expected,
        actualSettledFils: actual,
        differenceFils: 0n,
        reason: `Exact net match for ${reference}`,
      });
      continue;
    }

    results.push({
      outcome: 'AMOUNT_MISMATCH',
      referenceNormalized: reference,
      paymentIds: [payment.id],
      bankEntryIds: [bank.id],
      expectedNetFils: expected,
      actualSettledFils: actual,
      differenceFils: difference,
      reason: `Expected net ${expected} fils but bank settled ${actual} fils (difference ${difference} fils)`,
    });
  }

  return results;
}
