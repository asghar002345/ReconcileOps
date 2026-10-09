import type { MatchOutcome } from '../api/types';

export const OUTCOME_ORDER: MatchOutcome[] = [
  'MATCHED',
  'AMOUNT_MISMATCH',
  'PAYMENT_WITHOUT_BANK_ENTRY',
  'BANK_ENTRY_WITHOUT_PAYMENT',
  'AMBIGUOUS',
  'OUTSIDE_SETTLEMENT_WINDOW',
];

const LABELS: Record<MatchOutcome, string> = {
  MATCHED: 'Matched',
  AMOUNT_MISMATCH: 'Amount mismatch',
  PAYMENT_WITHOUT_BANK_ENTRY: 'Payment without bank entry',
  BANK_ENTRY_WITHOUT_PAYMENT: 'Bank entry without payment',
  AMBIGUOUS: 'Ambiguous',
  OUTSIDE_SETTLEMENT_WINDOW: 'Outside settlement window',
};

const SHORT_LABELS: Record<MatchOutcome, string> = {
  MATCHED: 'Matched',
  AMOUNT_MISMATCH: 'Amount',
  PAYMENT_WITHOUT_BANK_ENTRY: 'No bank',
  BANK_ENTRY_WITHOUT_PAYMENT: 'No payment',
  AMBIGUOUS: 'Ambiguous',
  OUTSIDE_SETTLEMENT_WINDOW: 'Window',
};

/** Compact labels for dense table badges (single line). */
const TABLE_LABELS: Record<MatchOutcome, string> = {
  MATCHED: 'Matched',
  AMOUNT_MISMATCH: 'Amount mismatch',
  PAYMENT_WITHOUT_BANK_ENTRY: 'No bank entry',
  BANK_ENTRY_WITHOUT_PAYMENT: 'No payment',
  AMBIGUOUS: 'Ambiguous',
  OUTSIDE_SETTLEMENT_WINDOW: 'Outside window',
};

export function outcomeLabel(outcome: MatchOutcome): string {
  return LABELS[outcome];
}

export function outcomeShortLabel(outcome: MatchOutcome): string {
  return SHORT_LABELS[outcome];
}

export function outcomeTableLabel(outcome: MatchOutcome): string {
  return TABLE_LABELS[outcome];
}

export function outcomeTone(
  outcome: MatchOutcome,
): 'success' | 'warning' | 'danger' | 'info' {
  switch (outcome) {
    case 'MATCHED':
      return 'success';
    case 'AMOUNT_MISMATCH':
    case 'OUTSIDE_SETTLEMENT_WINDOW':
    case 'AMBIGUOUS':
      return 'warning';
    case 'PAYMENT_WITHOUT_BANK_ENTRY':
    case 'BANK_ENTRY_WITHOUT_PAYMENT':
      return 'danger';
    default:
      return 'info';
  }
}
