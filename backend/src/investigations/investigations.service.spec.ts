import {
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../identity/auth.types.js';
import { InvestigationsService } from './investigations.service.js';

const analyst: AuthenticatedUser = {
  userId: 'user_analyst',
  email: 'analyst@demo.reconcileops.local',
  displayName: 'Demo Analyst',
  workspaceId: 'ws_demo',
  role: 'analyst',
};

const approver: AuthenticatedUser = {
  userId: 'user_approver',
  email: 'approver@demo.reconcileops.local',
  displayName: 'Demo Approver',
  workspaceId: 'ws_demo',
  role: 'approver',
};

function detailRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv_1',
    workspaceId: 'ws_demo',
    reconciliationResultId: 'rr_1',
    status: 'PENDING_APPROVAL',
    assignedToUserId: 'user_analyst',
    createdByUserId: 'user_analyst',
    version: 2,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    notes: [],
    proposals: [
      {
        id: 'prop_1',
        investigationId: 'inv_1',
        proposedByUserId: 'user_analyst',
        summary: 'Fee explained',
        status: 'PENDING',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        decision: null,
      },
    ],
    reconciliationResult: {
      id: 'rr_1',
      outcome: 'AMOUNT_MISMATCH',
      referenceNormalized: 'REF-200',
      expectedNetFils: 10000n,
      actualSettledFils: 9700n,
      differenceFils: -300n,
      reason: 'shortfall',
    },
    ...overrides,
  };
}

describe('InvestigationsService', () => {
  let prisma: {
    reconciliationResult: { findFirst: ReturnType<typeof vi.fn> };
    investigation: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
    };
    investigationNote: { create: ReturnType<typeof vi.fn> };
    resolutionProposal: {
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    resolutionDecision: { create: ReturnType<typeof vi.fn> };
    auditEvent: { create: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
    membership: { findUnique: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let service: InvestigationsService;

  beforeEach(() => {
    prisma = {
      reconciliationResult: { findFirst: vi.fn() },
      investigation: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
        findUniqueOrThrow: vi.fn(),
      },
      investigationNote: { create: vi.fn() },
      resolutionProposal: { create: vi.fn(), update: vi.fn() },
      resolutionDecision: { create: vi.fn() },
      auditEvent: { create: vi.fn(), findMany: vi.fn() },
      membership: { findUnique: vi.fn() },
      $transaction: vi.fn(async (fn: (tx: typeof prisma) => unknown) =>
        fn(prisma),
      ),
    };
    service = new InvestigationsService(prisma as never);
  });

  it('forbids an analyst from deciding a proposal', async () => {
    prisma.investigation.findFirst.mockResolvedValue(detailRow());

    await expect(
      service.decide(analyst, 'inv_1', 'prop_1', 'APPROVED', 2),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('forbids an approver from deciding their own proposal', async () => {
    prisma.investigation.findFirst.mockResolvedValue(
      detailRow({
        proposals: [
          {
            id: 'prop_1',
            investigationId: 'inv_1',
            proposedByUserId: 'user_approver',
            summary: 'self',
            status: 'PENDING',
            createdAt: new Date(),
            decision: null,
          },
        ],
      }),
    );

    await expect(
      service.decide(approver, 'inv_1', 'prop_1', 'APPROVED', 2),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns 409 when expectedVersion does not match', async () => {
    prisma.investigation.findFirst.mockResolvedValue(
      detailRow({ version: 3 }),
    );

    await expect(
      service.decide(approver, 'inv_1', 'prop_1', 'APPROVED', 2),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('approves in one transaction: proposal, decision, status, audit', async () => {
    const pending = detailRow();
    const resolved = detailRow({
      status: 'RESOLVED',
      version: 3,
      proposals: [
        {
          ...pending.proposals[0],
          status: 'APPROVED',
          decision: {
            id: 'dec_1',
            decidedByUserId: 'user_approver',
            decision: 'APPROVED',
            note: null,
            createdAt: new Date('2026-01-01T00:01:00.000Z'),
          },
        },
      ],
    });

    prisma.investigation.findFirst
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(resolved);
    prisma.investigation.updateMany.mockResolvedValue({ count: 1 });
    prisma.investigation.findUniqueOrThrow.mockResolvedValue({
      id: 'inv_1',
      version: 3,
    });

    const result = await service.decide(
      approver,
      'inv_1',
      'prop_1',
      'APPROVED',
      2,
    );

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.resolutionProposal.update).toHaveBeenCalledWith({
      where: { id: 'prop_1' },
      data: { status: 'APPROVED' },
    });
    expect(prisma.resolutionDecision.create).toHaveBeenCalled();
    expect(prisma.investigation.updateMany).toHaveBeenCalledWith({
      where: { id: 'inv_1', version: 2 },
      data: { status: 'RESOLVED', version: { increment: 1 } },
    });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'investigation.proposal_approved',
          entityId: 'inv_1',
        }),
      }),
    );
    expect(result.status).toBe('RESOLVED');
  });

  it('forbids an approver from creating an investigation', async () => {
    await expect(
      service.create(approver, 'rr_1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
