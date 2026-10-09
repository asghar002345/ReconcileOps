/**
 * JSON-safe payment row. Fils amounts are strings so large BIGINT
 * values survive JSON without precision loss.
 */
export type PaymentListItem = {
  id: string;
  workspaceId: string;
  providerAccountId: string;
  sourcePaymentId: string;
  referenceOriginal: string;
  referenceNormalized: string;
  grossAmountFils: string;
  feeAmountFils: string;
  currency: string;
  paidAt: string;
};

export type PaymentPage = {
  items: PaymentListItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  /** Present when using keyset pagination (Week 11). */
  nextCursor?: {
    paidAt: string;
    sourcePaymentId: string;
  } | null;
  mode: 'offset' | 'keyset';
};
