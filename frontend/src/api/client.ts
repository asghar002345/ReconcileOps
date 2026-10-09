import type {
  ApiErrorBody,
  AsyncOperationView,
  ExplainResult,
  ImportBatchSummary,
  InvestigationDetail,
  InvestigationListItem,
  LoginResult,
  PaymentPage,
  ReconciliationRunView,
} from './types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3000';

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

/** Register a handler invoked once per 401 response (clear session / redirect). */
export function setUnauthorizedHandler(
  handler: UnauthorizedHandler | null,
): void {
  unauthorizedHandler = handler;
}

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    const message =
      typeof body.message === 'string'
        ? body.message
        : Array.isArray(body.message)
          ? body.message.join(', ')
          : `Request failed (${status})`;
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text.slice(0, 200) };
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    throw new ApiError(0, {
      message: 'Network error. Check your connection and try again.',
    });
  }

  const body = (await parseJson(response)) as ApiErrorBody;
  if (!response.ok) {
    if (response.status === 401 && unauthorizedHandler) {
      unauthorizedHandler();
    }
    throw new ApiError(response.status, body);
  }
  return body as T;
}

export function login(email: string, password: string): Promise<LoginResult> {
  return request<LoginResult>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function fetchMe(token: string, signal?: AbortSignal): Promise<LoginResult['user']> {
  return request('/auth/me', { signal }, token);
}

export function listPayments(
  token: string,
  page = 1,
  pageSize = 20,
  signal?: AbortSignal,
): Promise<PaymentPage> {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  return request(`/payments?${query}`, { signal }, token);
}

export function fetchOperation(
  token: string,
  operationId: string,
  signal?: AbortSignal,
): Promise<AsyncOperationView> {
  return request(`/operations/${operationId}`, { signal }, token);
}

async function waitForOperation(
  token: string,
  operationId: string,
  signal?: AbortSignal,
): Promise<AsyncOperationView> {
  const started = Date.now();
  while (Date.now() - started < 30000) {
    if (signal?.aborted) {
      throw new ApiError(499, { message: 'Operation cancelled' });
    }
    const operation = await fetchOperation(token, operationId, signal);
    if (operation.status === 'succeeded' || operation.status === 'failed') {
      return operation;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new ApiError(408, { message: 'Operation timed out' });
}

export type ImportPhase = 'uploading' | 'processing';

export async function importCsv(
  token: string,
  kind: 'payments' | 'bank-entries',
  file: File,
  options?: {
    signal?: AbortSignal;
    onPhase?: (phase: ImportPhase) => void;
  },
): Promise<ImportBatchSummary> {
  const signal = options?.signal;
  const onPhase = options?.onPhase;
  const form = new FormData();
  form.append('file', file);
  onPhase?.('uploading');
  let response: Response;
  try {
    response = await fetch(`${API_URL}/imports/${kind}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    throw new ApiError(0, {
      message: 'Network error. Check your connection and try again.',
    });
  }
  const body = (await parseJson(response)) as ApiErrorBody;
  if (!response.ok) {
    if (response.status === 401 && unauthorizedHandler) {
      unauthorizedHandler();
    }
    throw new ApiError(response.status, body);
  }
  if (response.status === 200) {
    return body as unknown as ImportBatchSummary;
  }
  onPhase?.('processing');
  const queued = body as unknown as AsyncOperationView;
  const done = await waitForOperation(token, queued.id, signal);
  if (done.status === 'failed') {
    throw new ApiError(400, {
      message: done.errorMessage ?? 'Import failed',
    });
  }
  return done.result as unknown as ImportBatchSummary;
}

export function filsToAed(fils: string): string {
  const value = BigInt(fils);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${fraction}`;
}

export async function runReconciliation(
  token: string,
  signal?: AbortSignal,
): Promise<ReconciliationRunView> {
  const queued = await request<AsyncOperationView>(
    '/reconciliation/runs',
    { method: 'POST', signal },
    token,
  );
  const done = await waitForOperation(token, queued.id, signal);
  if (done.status === 'failed') {
    throw new ApiError(400, {
      message: done.errorMessage ?? 'Reconciliation failed',
    });
  }
  const runId = (done.result as { runId?: string } | null)?.runId;
  if (!runId) {
    throw new ApiError(500, { message: 'Operation succeeded without runId' });
  }
  return request(`/reconciliation/runs/${runId}`, { signal }, token);
}

export function fetchLatestReconciliation(
  token: string,
  signal?: AbortSignal,
): Promise<ReconciliationRunView> {
  return request('/reconciliation/runs/latest', { signal }, token);
}

export function listInvestigations(
  token: string,
  signal?: AbortSignal,
): Promise<InvestigationListItem[]> {
  return request('/investigations', { signal }, token);
}

export function fetchInvestigation(
  token: string,
  id: string,
  signal?: AbortSignal,
): Promise<InvestigationDetail> {
  return request(`/investigations/${id}`, { signal }, token);
}

export function createInvestigation(
  token: string,
  reconciliationResultId: string,
): Promise<InvestigationDetail> {
  return request(
    '/investigations',
    {
      method: 'POST',
      body: JSON.stringify({ reconciliationResultId }),
    },
    token,
  );
}

export function addInvestigationNote(
  token: string,
  id: string,
  body: string,
  expectedVersion: number,
): Promise<InvestigationDetail> {
  return request(
    `/investigations/${id}/notes`,
    {
      method: 'POST',
      body: JSON.stringify({ body, expectedVersion }),
    },
    token,
  );
}

export function proposeResolution(
  token: string,
  id: string,
  summary: string,
  expectedVersion: number,
): Promise<InvestigationDetail> {
  return request(
    `/investigations/${id}/proposals`,
    {
      method: 'POST',
      body: JSON.stringify({ summary, expectedVersion }),
    },
    token,
  );
}

export function decideProposal(
  token: string,
  investigationId: string,
  proposalId: string,
  decision: 'APPROVED' | 'REJECTED',
  expectedVersion: number,
  note?: string,
): Promise<InvestigationDetail> {
  return request(
    `/investigations/${investigationId}/proposals/${proposalId}/decide`,
    {
      method: 'POST',
      body: JSON.stringify({ decision, expectedVersion, note }),
    },
    token,
  );
}

export function explainInvestigation(
  token: string,
  investigationId: string,
): Promise<ExplainResult> {
  return request(
    `/investigations/${investigationId}/explain`,
    { method: 'POST' },
    token,
  );
}
