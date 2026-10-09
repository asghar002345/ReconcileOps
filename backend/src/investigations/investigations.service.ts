import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  InvestigationStatus,
  MembershipRole,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthenticatedUser } from '../identity/auth.types.js';

type InvestigationWithGraph = Prisma.InvestigationGetPayload<{
  include: {
    notes: true;
    proposals: { include: { decision: true } };
    reconciliationResult: true;
  };
}>;

@Injectable()
export class InvestigationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    actor: AuthenticatedUser,
    reconciliationResultId: string,
  ) {
    this.requireRole(actor, 'analyst');

    const result = await this.prisma.reconciliationResult.findFirst({
      where: {
        id: reconciliationResultId,
        run: { workspaceId: actor.workspaceId },
      },
      include: { run: true },
    });
    if (!result) {
      throw new NotFoundException('Reconciliation result not found');
    }
    if (result.outcome === 'MATCHED') {
      throw new BadRequestException(
        'Cannot open an investigation on a MATCHED result',
      );
    }

    const investigation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.investigation.create({
        data: {
          workspaceId: actor.workspaceId,
          reconciliationResultId: result.id,
          status: 'OPEN',
          createdByUserId: actor.userId,
          assignedToUserId: actor.userId,
          version: 1,
        },
        include: this.detailInclude(),
      });

      await tx.auditEvent.create({
        data: {
          workspaceId: actor.workspaceId,
          actorUserId: actor.userId,
          action: 'investigation.created',
          entityType: 'investigation',
          entityId: created.id,
          afterJson: {
            status: created.status,
            reconciliationResultId: created.reconciliationResultId,
          },
        },
      });

      return created;
    });

    return this.toDetail(investigation);
  }

  async list(workspaceId: string) {
    const rows = await this.prisma.investigation.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: {
        reconciliationResult: true,
        proposals: {
          where: { status: 'PENDING' },
          take: 1,
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      version: row.version,
      reconciliationResultId: row.reconciliationResultId,
      outcome: row.reconciliationResult.outcome,
      referenceNormalized: row.reconciliationResult.referenceNormalized,
      assignedToUserId: row.assignedToUserId,
      pendingProposalId: row.proposals[0]?.id ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async getDetail(workspaceId: string, investigationId: string) {
    const investigation = await this.requireInvestigation(
      workspaceId,
      investigationId,
    );
    const audit = await this.prisma.auditEvent.findMany({
      where: {
        workspaceId,
        entityType: 'investigation',
        entityId: investigationId,
      },
      orderBy: { createdAt: 'asc' },
    });
    return {
      ...this.toDetail(investigation),
      audit: audit.map((event) => ({
        id: event.id,
        action: event.action,
        actorUserId: event.actorUserId,
        before: event.beforeJson,
        after: event.afterJson,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  async assign(
    actor: AuthenticatedUser,
    investigationId: string,
    assigneeUserId: string,
    expectedVersion: number,
  ) {
    this.requireRole(actor, 'analyst');
    const current = await this.requireInvestigation(
      actor.workspaceId,
      investigationId,
    );
    this.assertVersion(current.version, expectedVersion);

    const membership = await this.prisma.membership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: actor.workspaceId,
          userId: assigneeUserId,
        },
      },
    });
    if (!membership) {
      throw new BadRequestException('Assignee is not a workspace member');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await this.updateWithVersion(tx, current.id, expectedVersion, {
        assignedToUserId: assigneeUserId,
        status:
          current.status === 'OPEN' ? 'IN_PROGRESS' : current.status,
      });

      await tx.auditEvent.create({
        data: {
          workspaceId: actor.workspaceId,
          actorUserId: actor.userId,
          action: 'investigation.assigned',
          entityType: 'investigation',
          entityId: current.id,
          beforeJson: { assignedToUserId: current.assignedToUserId },
          afterJson: { assignedToUserId: assigneeUserId, version: row.version },
        },
      });

      return this.requireInvestigation(actor.workspaceId, investigationId, tx);
    });

    return this.toDetail(updated);
  }

  async addNote(
    actor: AuthenticatedUser,
    investigationId: string,
    body: string,
    expectedVersion: number,
  ) {
    this.requireRole(actor, 'analyst');
    const current = await this.requireInvestigation(
      actor.workspaceId,
      investigationId,
    );
    this.assertVersion(current.version, expectedVersion);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.investigationNote.create({
        data: {
          investigationId,
          authorUserId: actor.userId,
          body: body.trim(),
        },
      });

      await this.updateWithVersion(tx, current.id, expectedVersion, {
        status:
          current.status === 'OPEN' ? 'IN_PROGRESS' : current.status,
      });

      await tx.auditEvent.create({
        data: {
          workspaceId: actor.workspaceId,
          actorUserId: actor.userId,
          action: 'investigation.note_added',
          entityType: 'investigation',
          entityId: current.id,
          afterJson: { body: body.trim() },
        },
      });

      return this.requireInvestigation(actor.workspaceId, investigationId, tx);
    });

    return this.toDetail(updated);
  }

  async propose(
    actor: AuthenticatedUser,
    investigationId: string,
    summary: string,
    expectedVersion: number,
  ) {
    this.requireRole(actor, 'analyst');
    const current = await this.requireInvestigation(
      actor.workspaceId,
      investigationId,
    );
    this.assertVersion(current.version, expectedVersion);

    if (
      current.status === 'RESOLVED' ||
      current.status === 'PENDING_APPROVAL'
    ) {
      throw new BadRequestException(
        `Cannot propose while investigation is ${current.status}`,
      );
    }

    const pending = current.proposals.find((p) => p.status === 'PENDING');
    if (pending) {
      throw new ConflictException('A pending proposal already exists');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const proposal = await tx.resolutionProposal.create({
        data: {
          investigationId,
          proposedByUserId: actor.userId,
          summary: summary.trim(),
          status: 'PENDING',
        },
      });

      await this.updateWithVersion(tx, current.id, expectedVersion, {
        status: 'PENDING_APPROVAL',
      });

      await tx.auditEvent.create({
        data: {
          workspaceId: actor.workspaceId,
          actorUserId: actor.userId,
          action: 'investigation.proposal_created',
          entityType: 'investigation',
          entityId: current.id,
          afterJson: {
            proposalId: proposal.id,
            summary: proposal.summary,
          },
        },
      });

      return this.requireInvestigation(actor.workspaceId, investigationId, tx);
    });

    return this.toDetail(updated);
  }

  async decide(
    actor: AuthenticatedUser,
    investigationId: string,
    proposalId: string,
    decision: 'APPROVED' | 'REJECTED',
    expectedVersion: number,
    note?: string,
  ) {
    this.requireRole(actor, 'approver');
    const current = await this.requireInvestigation(
      actor.workspaceId,
      investigationId,
    );
    this.assertVersion(current.version, expectedVersion);

    const proposal = current.proposals.find((p) => p.id === proposalId);
    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }
    if (proposal.status !== 'PENDING') {
      throw new ConflictException('Proposal is no longer pending');
    }
    if (proposal.proposedByUserId === actor.userId) {
      throw new ForbiddenException('Cannot approve or reject your own proposal');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.resolutionProposal.update({
        where: { id: proposal.id },
        data: { status: decision },
      });

      await tx.resolutionDecision.create({
        data: {
          proposalId: proposal.id,
          decidedByUserId: actor.userId,
          decision,
          note: note?.trim() || null,
        },
      });

      const nextStatus =
        decision === 'APPROVED' ? 'RESOLVED' : 'RETURNED_TO_REVIEW';

      await this.updateWithVersion(tx, current.id, expectedVersion, {
        status: nextStatus,
      });

      await tx.auditEvent.create({
        data: {
          workspaceId: actor.workspaceId,
          actorUserId: actor.userId,
          action:
            decision === 'APPROVED'
              ? 'investigation.proposal_approved'
              : 'investigation.proposal_rejected',
          entityType: 'investigation',
          entityId: current.id,
          beforeJson: { status: current.status, proposalStatus: 'PENDING' },
          afterJson: {
            status: nextStatus,
            proposalStatus: decision,
            note: note?.trim() || null,
          },
        },
      });

      return this.requireInvestigation(actor.workspaceId, investigationId, tx);
    });

    return this.toDetail(updated);
  }

  private requireRole(actor: AuthenticatedUser, role: MembershipRole): void {
    if (actor.role !== role) {
      throw new ForbiddenException(`Requires role ${role}`);
    }
  }

  private assertVersion(actual: number, expected: number): void {
    if (actual !== expected) {
      throw new ConflictException(
        `Stale investigation version: expected ${expected}, actual ${actual}`,
      );
    }
  }

  private detailInclude() {
    return {
      notes: { orderBy: { createdAt: 'asc' as const } },
      proposals: {
        orderBy: { createdAt: 'asc' as const },
        include: { decision: true },
      },
      reconciliationResult: true,
    };
  }

  private async requireInvestigation(
    workspaceId: string,
    investigationId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<InvestigationWithGraph> {
    const row = await db.investigation.findFirst({
      where: { id: investigationId, workspaceId },
      include: this.detailInclude(),
    });
    if (!row) {
      throw new NotFoundException('Investigation not found');
    }
    return row;
  }

  private async updateWithVersion(
    tx: Prisma.TransactionClient,
    investigationId: string,
    expectedVersion: number,
    data: {
      status?: InvestigationStatus;
      assignedToUserId?: string | null;
    },
  ) {
    const result = await tx.investigation.updateMany({
      where: { id: investigationId, version: expectedVersion },
      data: {
        ...data,
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) {
      throw new ConflictException(
        'Investigation was updated concurrently; reload and retry',
      );
    }
    return tx.investigation.findUniqueOrThrow({
      where: { id: investigationId },
    });
  }

  private toDetail(row: InvestigationWithGraph) {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      status: row.status,
      version: row.version,
      assignedToUserId: row.assignedToUserId,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      discrepancy: {
        resultId: row.reconciliationResult.id,
        outcome: row.reconciliationResult.outcome,
        referenceNormalized: row.reconciliationResult.referenceNormalized,
        expectedNetFils:
          row.reconciliationResult.expectedNetFils?.toString() ?? null,
        actualSettledFils:
          row.reconciliationResult.actualSettledFils?.toString() ?? null,
        differenceFils:
          row.reconciliationResult.differenceFils?.toString() ?? null,
        reason: row.reconciliationResult.reason,
      },
      notes: row.notes.map((note) => ({
        id: note.id,
        authorUserId: note.authorUserId,
        body: note.body,
        createdAt: note.createdAt.toISOString(),
      })),
      proposals: row.proposals.map((proposal) => ({
        id: proposal.id,
        proposedByUserId: proposal.proposedByUserId,
        summary: proposal.summary,
        status: proposal.status,
        createdAt: proposal.createdAt.toISOString(),
        decision: proposal.decision
          ? {
              id: proposal.decision.id,
              decidedByUserId: proposal.decision.decidedByUserId,
              decision: proposal.decision.decision,
              note: proposal.decision.note,
              createdAt: proposal.decision.createdAt.toISOString(),
            }
          : null,
      })),
    };
  }
}
