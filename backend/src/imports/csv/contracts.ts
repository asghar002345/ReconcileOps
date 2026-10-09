export const PROVIDER_ACCOUNT_ID = 'acct_paydemo_aed';
export const MAX_IMPORT_BYTES = 1_000_000;
export const MAX_IMPORT_ROWS = 1000;

export const PAYMENT_HEADERS = [
  'payment_id',
  'reference',
  'gross_amount',
  'fee_amount',
  'currency',
  'paid_at',
] as const;

export const BANK_HEADERS = [
  'bank_entry_id',
  'reference',
  'settled_amount',
  'currency',
  'settled_at',
] as const;

export type PaymentHeader = (typeof PAYMENT_HEADERS)[number];
export type BankHeader = (typeof BANK_HEADERS)[number];

export type ImportRowError = {
  rowNumber: number;
  field: string;
  message: string;
};

export type ValidatedPaymentRow = {
  rowNumber: number;
  sourcePaymentId: string;
  referenceOriginal: string;
  referenceNormalized: string;
  grossAmountFils: bigint;
  feeAmountFils: bigint;
  currency: 'AED';
  paidAt: Date;
  rawPayload: Record<string, string>;
};

export type ValidatedBankRow = {
  rowNumber: number;
  sourceBankEntryId: string;
  referenceOriginal: string;
  referenceNormalized: string;
  settledAmountFils: bigint;
  currency: 'AED';
  settledAt: Date;
  rawPayload: Record<string, string>;
};
