export type AuthenticatedUser = {
  userId: string;
  email: string;
  displayName: string;
  workspaceId: string;
  role: 'analyst' | 'approver';
};

export type LoginResult = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: AuthenticatedUser;
};

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
  mode?: 'offset' | 'keyset';
  nextCursor?: { paidAt: string; sourcePaymentId: string } | null;
};

export type ImportBatchSummary = {
  batchId: string;
  kind: 'payments' | 'bank_entries';
  status: 'published';
  fileName: string;
  fileHashSha256: string;
  rowCount: number;
  reused: boolean;
};

export type ImportRowError = {
  rowNumber: number;
  field: string;
  message: string;
};

export type ApiErrorBody = {
  message?: string | string[];
  errors?: ImportRowError[];
  statusCode?: number;
};

export type MatchOutcome =
  | 'MATCHED'
  | 'AMOUNT_MISMATCH'
  | 'PAYMENT_WITHOUT_BANK_ENTRY'
  | 'BANK_ENTRY_WITHOUT_PAYMENT'
  | 'AMBIGUOUS'
  | 'OUTSIDE_SETTLEMENT_WINDOW';

export type ReconciliationResultView = {
  id: string;
  outcome: MatchOutcome;
  referenceNormalized: string;
  paymentIds: string[];
  bankEntryIds: string[];
  expectedNetFils: string | null;
  actualSettledFils: string | null;
  differenceFils: string | null;
  reason: string;
};

export type AsyncOperationView = {
  id: string;
  workspaceId: string;
  kind: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  correlationId: string;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type ReconciliationRunView = {
  id: string;
  workspaceId: string;
  providerAccountId: string;
  ruleVersion: string;
  createdByUserId: string;
  resultCount: number;
  createdAt: string;
  summary: Record<MatchOutcome, number>;
  results: ReconciliationResultView[];
};

export type InvestigationStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'PENDING_APPROVAL'
  | 'RESOLVED'
  | 'RETURNED_TO_REVIEW';

export type InvestigationListItem = {
  id: string;
  status: InvestigationStatus;
  version: number;
  reconciliationResultId: string;
  outcome: MatchOutcome;
  referenceNormalized: string;
  assignedToUserId: string | null;
  pendingProposalId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InvestigationNote = {
  id: string;
  authorUserId: string;
  body: string;
  createdAt: string;
};

export type InvestigationProposal = {
  id: string;
  proposedByUserId: string;
  summary: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  decision: {
    id: string;
    decidedByUserId: string;
    decision: 'APPROVED' | 'REJECTED';
    note: string | null;
    createdAt: string;
  } | null;
};

export type InvestigationDetail = {
  id: string;
  workspaceId: string;
  status: InvestigationStatus;
  version: number;
  assignedToUserId: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  discrepancy: {
    resultId: string;
    outcome: MatchOutcome;
    referenceNormalized: string;
    expectedNetFils: string | null;
    actualSettledFils: string | null;
    differenceFils: string | null;
    reason: string;
  };
  notes: InvestigationNote[];
  proposals: InvestigationProposal[];
  /** Present on GET detail; mutate responses may omit this field. */
  audit?: Array<{
    id: string;
    action: string;
    actorUserId: string;
    before: unknown;
    after: unknown;
    createdAt: string;
  }>;
};

export type ExplainResult = {
  id: string;
  investigationId: string;
  promptVersion: string;
  modelVersion: string;
  latencyMs: number;
  evidence: Record<string, unknown>;
  explanation: {
    observedFacts: string[];
    possibleCauses: string[];
    missingEvidence: string[];
    nextSteps: string[];
    citations: Array<{
      chunkId: string;
      documentTitle: string;
      section: string;
      isDemoPolicy: boolean;
    }>;
    uncertainty: string;
    arithmetic: {
      expectedNetFils: string | null;
      actualSettledFils: string | null;
      differenceFils: string | null;
      differenceAgreesWithSql: boolean;
    };
  };
  createdAt: string;
};
