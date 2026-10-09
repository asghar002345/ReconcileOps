import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { PROVIDER_ACCOUNT_ID } from '../imports/csv/contracts.js';
import { JOB_RECONCILIATION_RUN } from '../jobs/jobs.constants.js';
import {
  OperationsService,
  type OperationView,
} from '../jobs/operations.service.js';
import {
  classifyWorkspace,
  RULE_VERSION,
  type MatchOutcome,
} from './matching.rules.js';

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

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operationsService: OperationsService,
  ) {}

  enqueueRun(
    workspaceId: string,
    requestedByUserId: string,
  ): Promise<OperationView> {
    return this.operationsService.enqueue(
      workspaceId,
      requestedByUserId,
      'reconciliation_run',
      JOB_RECONCILIATION_RUN,
      {},
    );
  }

  /** Worker entry: classify snapshot and store a new run. */
  async run(
    workspaceId: string,
    createdByUserId: string,
  ): Promise<ReconciliationRunView> {
    const [payments, bankEntries] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          workspaceId,
          providerAccountId: PROVIDER_ACCOUNT_ID,
          currency: 'AED',
        },
      }),
      this.prisma.bankEntry.findMany({
        where: {
          workspaceId,
          providerAccountId: PROVIDER_ACCOUNT_ID,
          currency: 'AED',
        },
      }),
    ]);

    const drafts = classifyWorkspace(
      payments.map((payment) => ({
        id: payment.id,
        sourcePaymentId: payment.sourcePaymentId,
        referenceNormalized: payment.referenceNormalized,
        grossAmountFils: payment.grossAmountFils,
        feeAmountFils: payment.feeAmountFils,
        paidAt: payment.paidAt,
      })),
      bankEntries.map((bank) => ({
        id: bank.id,
        sourceBankEntryId: bank.sourceBankEntryId,
        referenceNormalized: bank.referenceNormalized,
        settledAmountFils: bank.settledAmountFils,
        settledAt: bank.settledAt,
      })),
    );

    const run = await this.prisma.$transaction(async (tx) => {
      const created = await tx.reconciliationRun.create({
        data: {
          workspaceId,
          providerAccountId: PROVIDER_ACCOUNT_ID,
          ruleVersion: RULE_VERSION,
          createdByUserId,
          resultCount: drafts.length,
        },
      });

      if (drafts.length > 0) {
        await tx.reconciliationResult.createMany({
          data: drafts.map((draft) => ({
            runId: created.id,
            outcome: draft.outcome,
            referenceNormalized: draft.referenceNormalized,
            paymentIds: draft.paymentIds,
            bankEntryIds: draft.bankEntryIds,
            expectedNetFils: draft.expectedNetFils,
            actualSettledFils: draft.actualSettledFils,
            differenceFils: draft.differenceFils,
            reason: draft.reason,
          })),
        });
      }

      return tx.reconciliationRun.findUniqueOrThrow({
        where: { id: created.id },
        include: { results: { orderBy: { referenceNormalized: 'asc' } } },
      });
    });

    return this.toView(run);
  }

  async getLatest(workspaceId: string): Promise<ReconciliationRunView> {
    const run = await this.prisma.reconciliationRun.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: { results: { orderBy: { referenceNormalized: 'asc' } } },
    });
    if (!run) {
      throw new NotFoundException('No reconciliation run for this workspace yet');
    }
    return this.toView(run);
  }

  async getById(
    workspaceId: string,
    runId: string,
  ): Promise<ReconciliationRunView> {
    const run = await this.prisma.reconciliationRun.findFirst({
      where: { id: runId, workspaceId },
      include: { results: { orderBy: { referenceNormalized: 'asc' } } },
    });
    if (!run) {
      throw new NotFoundException('Reconciliation run not found');
    }
    return this.toView(run);
  }

  private toView(
    run: Prisma.ReconciliationRunGetPayload<{
      include: { results: true };
    }>,
  ): ReconciliationRunView {
    const summary: Record<MatchOutcome, number> = {
      MATCHED: 0,
      AMOUNT_MISMATCH: 0,
      PAYMENT_WITHOUT_BANK_ENTRY: 0,
      BANK_ENTRY_WITHOUT_PAYMENT: 0,
      AMBIGUOUS: 0,
      OUTSIDE_SETTLEMENT_WINDOW: 0,
    };

    const results = run.results.map((result) => {
      summary[result.outcome] += 1;
      return {
        id: result.id,
        outcome: result.outcome,
        referenceNormalized: result.referenceNormalized,
        paymentIds: result.paymentIds,
        bankEntryIds: result.bankEntryIds,
        expectedNetFils:
          result.expectedNetFils === null
            ? null
            : result.expectedNetFils.toString(),
        actualSettledFils:
          result.actualSettledFils === null
            ? null
            : result.actualSettledFils.toString(),
        differenceFils:
          result.differenceFils === null
            ? null
            : result.differenceFils.toString(),
        reason: result.reason,
      };
    });

    return {
      id: run.id,
      workspaceId: run.workspaceId,
      providerAccountId: run.providerAccountId,
      ruleVersion: run.ruleVersion,
      createdByUserId: run.createdByUserId,
      resultCount: run.resultCount,
      createdAt: run.createdAt.toISOString(),
      summary,
      results,
    };
  }
}
