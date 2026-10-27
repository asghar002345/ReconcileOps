import type { Page, Route } from '@playwright/test';

const API_ORIGIN = 'http://127.0.0.1:3000';
const NOW = '2026-10-27T12:00:00.000Z';

type Role = 'analyst' | 'approver';

type User = {
  userId: string;
  email: string;
  displayName: string;
  workspaceId: string;
  role: Role;
};

const USERS: Record<string, User> = {
  'analyst-token': {
    userId: 'user_analyst',
    email: 'analyst@demo.reconcileops.local',
    displayName: 'Demo Analyst',
    workspaceId: 'ws_demo',
    role: 'analyst',
  },
  'approver-token': {
    userId: 'user_approver',
    email: 'approver@demo.reconcileops.local',
    displayName: 'Demo Approver',
    workspaceId: 'ws_demo',
    role: 'approver',
  },
};

type Proposal = {
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

type Investigation = {
  id: string;
  workspaceId: string;
  status: string;
  version: number;
  assignedToUserId: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  discrepancy: {
    resultId: string;
    outcome: 'AMOUNT_MISMATCH';
    referenceNormalized: string;
    expectedNetFils: string;
    actualSettledFils: string;
    differenceFils: string;
    reason: string;
  };
  notes: Array<{ id: string; authorUserId: string; body: string; createdAt: string }>;
  proposals: Proposal[];
  audit: Array<{
    id: string;
    action: string;
    actorUserId: string;
    before: unknown;
    after: unknown;
    createdAt: string;
  }>;
};

const RUN = {
  id: 'run_1',
  workspaceId: 'ws_demo',
  providerAccountId: 'acct_paydemo_aed',
  ruleVersion: 'v1',
  createdByUserId: 'user_analyst',
  resultCount: 1,
  createdAt: NOW,
  summary: {
    MATCHED: 0,
    AMOUNT_MISMATCH: 1,
    PAYMENT_WITHOUT_BANK_ENTRY: 0,
    BANK_ENTRY_WITHOUT_PAYMENT: 0,
    AMBIGUOUS: 0,
    OUTSIDE_SETTLEMENT_WINDOW: 0,
  },
  results: [
    {
      id: 'res_1',
      outcome: 'AMOUNT_MISMATCH',
      referenceNormalized: 'REF-IMP-01',
      paymentIds: ['pay_1'],
      bankEntryIds: ['bank_1'],
      expectedNetFils: '9700',
      actualSettledFils: '9400',
      differenceFils: '-300',
      reason: 'Expected net does not equal the settled amount.',
    },
  ],
};

const CORS = {
  'access-control-allow-origin': 'http://127.0.0.1:4173',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
};

function userFrom(route: Route): User | null {
  const header = route.request().headers().authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  return USERS[token] ?? null;
}

async function send(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: CORS,
    body: JSON.stringify(body),
  });
}

export async function installMockApi(
  page: Page,
  options?: { failPaymentsOnce?: boolean },
): Promise<void> {
  let ran = false;
  let investigation: Investigation | null = null;
  let paymentsFailuresLeft = options?.failPaymentsOnce ? 1 : 0;

  await page.route(`${API_ORIGIN}/**`, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }

    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === 'POST' && path === '/auth/login') {
      const body = request.postDataJSON() as { email?: string; password?: string };
      const user = Object.values(USERS).find((candidate) => candidate.email === body.email);
      if (!user || body.password !== 'Password123!') {
        await send(route, 401, { message: 'Invalid email or password' });
        return;
      }
      const token = user.role === 'analyst' ? 'analyst-token' : 'approver-token';
      await send(route, 200, {
        accessToken: token,
        tokenType: 'Bearer',
        expiresIn: '1h',
        user,
      });
      return;
    }

    const user = userFrom(route);
    if (!user) {
      await send(route, 401, { message: 'Unauthorized' });
      return;
    }

    if (method === 'GET' && path === '/auth/me') {
      await send(route, 200, user);
      return;
    }

    if (method === 'GET' && path === '/payments') {
      if (paymentsFailuresLeft > 0) {
        paymentsFailuresLeft -= 1;
        await send(route, 500, { message: 'database unavailable' });
        return;
      }
      await send(route, 200, {
        items: [],
        page: Number(url.searchParams.get('page') ?? '1'),
        pageSize: Number(url.searchParams.get('pageSize') ?? '20'),
        totalItems: 0,
        totalPages: 1,
      });
      return;
    }

    if (method === 'POST' && (path === '/imports/payments' || path === '/imports/bank-entries')) {
      const bank = path.endsWith('bank-entries');
      await send(route, 200, {
        batchId: bank ? 'batch_bank' : 'batch_payments',
        kind: bank ? 'bank_entries' : 'payments',
        status: 'published',
        fileName: bank ? 'bank.csv' : 'payments.csv',
        fileHashSha256: 'a'.repeat(64),
        rowCount: 1,
        reused: false,
      });
      return;
    }

    if (method === 'GET' && path === '/reconciliation/runs/latest') {
      if (!ran) {
        await send(route, 404, { message: 'No reconciliation run yet' });
        return;
      }
      await send(route, 200, RUN);
      return;
    }

    if (method === 'POST' && path === '/reconciliation/runs') {
      ran = true;
      await send(route, 202, {
        id: 'op_recon_1',
        workspaceId: 'ws_demo',
        kind: 'reconciliation',
        status: 'queued',
        correlationId: 'op_recon_1',
        result: null,
        errorMessage: null,
        attempts: 0,
        createdAt: NOW,
        updatedAt: NOW,
        startedAt: null,
        finishedAt: null,
      });
      return;
    }

    if (method === 'GET' && path === '/operations/op_recon_1') {
      await send(route, 200, {
        id: 'op_recon_1',
        workspaceId: 'ws_demo',
        kind: 'reconciliation',
        status: 'succeeded',
        correlationId: 'op_recon_1',
        result: { runId: 'run_1' },
        errorMessage: null,
        attempts: 1,
        createdAt: NOW,
        updatedAt: NOW,
        startedAt: NOW,
        finishedAt: NOW,
      });
      return;
    }

    if (method === 'GET' && path === '/reconciliation/runs/run_1') {
      await send(route, 200, RUN);
      return;
    }

    if (method === 'GET' && path === '/investigations') {
      if (!investigation) {
        await send(route, 200, []);
        return;
      }
      const pending = investigation.proposals.find((proposal) => proposal.status === 'PENDING');
      await send(route, 200, [
        {
          id: investigation.id,
          status: investigation.status,
          version: investigation.version,
          reconciliationResultId: investigation.discrepancy.resultId,
          outcome: investigation.discrepancy.outcome,
          referenceNormalized: investigation.discrepancy.referenceNormalized,
          assignedToUserId: investigation.assignedToUserId,
          pendingProposalId: pending?.id ?? null,
          createdAt: investigation.createdAt,
          updatedAt: investigation.updatedAt,
        },
      ]);
      return;
    }

    if (method === 'POST' && path === '/investigations') {
      investigation = {
        id: 'inv_1',
        workspaceId: 'ws_demo',
        status: 'OPEN',
        version: 1,
        assignedToUserId: user.userId,
        createdByUserId: user.userId,
        createdAt: NOW,
        updatedAt: NOW,
        discrepancy: {
          resultId: 'res_1',
          outcome: 'AMOUNT_MISMATCH',
          referenceNormalized: 'REF-IMP-01',
          expectedNetFils: '9700',
          actualSettledFils: '9400',
          differenceFils: '-300',
          reason: 'Expected net does not equal the settled amount.',
        },
        notes: [],
        proposals: [],
        audit: [
          {
            id: 'audit_open',
            action: 'investigation.opened',
            actorUserId: user.userId,
            before: null,
            after: { status: 'OPEN' },
            createdAt: NOW,
          },
        ],
      };
      await send(route, 201, investigation);
      return;
    }

    const detailMatch = /^\/investigations\/([^/]+)$/.exec(path);
    if (detailMatch && method === 'GET') {
      if (!investigation || investigation.id !== detailMatch[1]) {
        await send(route, 404, { message: 'Investigation not found' });
        return;
      }
      await send(route, 200, investigation);
      return;
    }

    const notesMatch = /^\/investigations\/([^/]+)\/notes$/.exec(path);
    if (notesMatch && method === 'POST') {
      if (!investigation || user.role !== 'analyst') {
        await send(route, 403, { message: 'Forbidden' });
        return;
      }
      const body = request.postDataJSON() as { body?: string; expectedVersion?: number };
      if (body.expectedVersion !== investigation.version) {
        await send(route, 409, { message: 'This record changed. Refresh and try again.' });
        return;
      }
      investigation = {
        ...investigation,
        version: investigation.version + 1,
        updatedAt: NOW,
        notes: [
          ...investigation.notes,
          {
            id: `note_${investigation.notes.length + 1}`,
            authorUserId: user.userId,
            body: body.body ?? '',
            createdAt: NOW,
          },
        ],
      };
      await send(route, 200, investigation);
      return;
    }

    const proposeMatch = /^\/investigations\/([^/]+)\/proposals$/.exec(path);
    if (proposeMatch && method === 'POST') {
      if (!investigation || user.role !== 'analyst') {
        await send(route, 403, { message: 'Forbidden' });
        return;
      }
      const body = request.postDataJSON() as { summary?: string; expectedVersion?: number };
      if (body.expectedVersion !== investigation.version) {
        await send(route, 409, { message: 'This record changed. Refresh and try again.' });
        return;
      }
      investigation = {
        ...investigation,
        status: 'PENDING_APPROVAL',
        version: investigation.version + 1,
        updatedAt: NOW,
        proposals: [
          ...investigation.proposals,
          {
            id: 'prop_1',
            proposedByUserId: user.userId,
            summary: body.summary ?? '',
            status: 'PENDING',
            createdAt: NOW,
            decision: null,
          },
        ],
      };
      await send(route, 200, investigation);
      return;
    }

    const decideMatch = /^\/investigations\/([^/]+)\/proposals\/([^/]+)\/decide$/.exec(path);
    if (decideMatch && method === 'POST') {
      if (!investigation || user.role !== 'approver') {
        await send(route, 403, { message: 'Forbidden' });
        return;
      }
      const body = request.postDataJSON() as {
        decision?: 'APPROVED' | 'REJECTED';
        expectedVersion?: number;
        note?: string;
      };
      if (body.expectedVersion !== investigation.version) {
        await send(route, 409, { message: 'This record changed. Refresh and try again.' });
        return;
      }
      const proposal = investigation.proposals.find((item) => item.id === decideMatch[2]);
      if (!proposal || proposal.status !== 'PENDING') {
        await send(route, 404, { message: 'Proposal not found' });
        return;
      }
      if (proposal.proposedByUserId === user.userId) {
        await send(route, 403, { message: 'Cannot approve your own proposal' });
        return;
      }
      const decision = body.decision === 'REJECTED' ? 'REJECTED' : 'APPROVED';
      const decided: Proposal = {
        ...proposal,
        status: decision,
        decision: {
          id: 'dec_1',
          decidedByUserId: user.userId,
          decision,
          note: body.note ?? null,
          createdAt: NOW,
        },
      };
      investigation = {
        ...investigation,
        status: decision === 'APPROVED' ? 'RESOLVED' : 'RETURNED_TO_REVIEW',
        version: investigation.version + 1,
        updatedAt: NOW,
        proposals: investigation.proposals.map((item) =>
          item.id === decided.id ? decided : item,
        ),
        audit: [
          ...investigation.audit,
          {
            id: 'audit_decision',
            action: decision === 'APPROVED' ? 'proposal.approved' : 'proposal.rejected',
            actorUserId: user.userId,
            before: { status: 'PENDING_APPROVAL' },
            after: { status: decision === 'APPROVED' ? 'RESOLVED' : 'RETURNED_TO_REVIEW' },
            createdAt: NOW,
          },
        ],
      };
      await send(route, 200, investigation);
      return;
    }

    await send(route, 404, { message: `No mock for ${method} ${path}` });
  });
}
