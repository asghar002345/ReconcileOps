export const RECONCILEOPS_QUEUE = 'reconcileops';

export const JOB_RECONCILIATION_RUN = 'reconciliation.run';
export const JOB_IMPORT_PAYMENTS = 'import.payments';
export const JOB_IMPORT_BANK_ENTRIES = 'import.bank_entries';
export const JOB_WEBHOOK_PAYMENT_CAPTURED = 'webhook.payment_captured';

export type JobName =
  | typeof JOB_RECONCILIATION_RUN
  | typeof JOB_IMPORT_PAYMENTS
  | typeof JOB_IMPORT_BANK_ENTRIES
  | typeof JOB_WEBHOOK_PAYMENT_CAPTURED;

export type ReconciliationJobPayload = {
  operationId: string;
  workspaceId: string;
  requestedByUserId: string;
};

export type ImportJobPayload = {
  operationId: string;
  workspaceId: string;
  requestedByUserId: string;
  stagingPath: string;
  fileName: string;
  fileHashSha256: string;
};

export type WebhookJobPayload = {
  operationId: string;
  workspaceId: string;
  webhookEventId: string;
};
