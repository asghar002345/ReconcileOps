import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AsyncOperationKind,
  AsyncOperationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import type { JobName } from './jobs.constants.js';

export type OperationView = {
  id: string;
  workspaceId: string;
  kind: AsyncOperationKind;
  status: AsyncOperationStatus;
  correlationId: string;
  result: unknown;
  errorMessage: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(
    workspaceId: string,
    requestedByUserId: string,
    kind: AsyncOperationKind,
    jobName: JobName,
    payload: Record<string, unknown>,
  ): Promise<OperationView> {
    const correlationId = randomUUID();
    const operation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.asyncOperation.create({
        data: {
          workspaceId,
          kind,
          status: 'queued',
          requestedByUserId,
          correlationId,
        },
      });

      await tx.outboxEvent.create({
        data: {
          workspaceId,
          operationId: created.id,
          jobName,
          payloadJson: {
            ...payload,
            operationId: created.id,
            workspaceId,
            requestedByUserId,
          } as Prisma.InputJsonValue,
          status: 'pending',
        },
      });

      return created;
    });

    return this.toView(operation);
  }

  async getById(workspaceId: string, operationId: string): Promise<OperationView> {
    const row = await this.prisma.asyncOperation.findFirst({
      where: { id: operationId, workspaceId },
    });
    if (!row) {
      throw new NotFoundException('Operation not found');
    }
    return this.toView(row);
  }

  async markRunning(operationId: string): Promise<boolean> {
    const result = await this.prisma.asyncOperation.updateMany({
      where: {
        id: operationId,
        status: { in: ['queued', 'failed'] },
      },
      data: {
        status: 'running',
        startedAt: new Date(),
        attempts: { increment: 1 },
        errorMessage: null,
        finishedAt: null,
      },
    });
    return result.count === 1;
  }

  async markSucceeded(
    operationId: string,
    resultJson: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.asyncOperation.update({
      where: { id: operationId },
      data: {
        status: 'succeeded',
        resultJson,
        finishedAt: new Date(),
        errorMessage: null,
      },
    });
  }

  async markFailed(operationId: string, errorMessage: string): Promise<void> {
    await this.prisma.asyncOperation.update({
      where: { id: operationId },
      data: {
        status: 'failed',
        errorMessage: errorMessage.slice(0, 2000),
        finishedAt: new Date(),
      },
    });
  }

  async isTerminalSuccess(operationId: string): Promise<boolean> {
    const row = await this.prisma.asyncOperation.findUnique({
      where: { id: operationId },
      select: { status: true },
    });
    return row?.status === 'succeeded';
  }

  async retryFailed(
    workspaceId: string,
    operationId: string,
  ): Promise<OperationView> {
    const row = await this.prisma.asyncOperation.findFirst({
      where: { id: operationId, workspaceId },
      include: { outboxEvent: true },
    });
    if (!row) {
      throw new NotFoundException('Operation not found');
    }
    if (row.status !== 'failed') {
      throw new BadRequestException('Only failed operations can be retried');
    }
    if (!row.outboxEvent) {
      throw new BadRequestException('Operation has no outbox event to retry');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const operation = await tx.asyncOperation.update({
        where: { id: operationId },
        data: {
          status: 'queued',
          errorMessage: null,
          finishedAt: null,
          startedAt: null,
        },
      });
      await tx.outboxEvent.update({
        where: { id: row.outboxEvent!.id },
        data: {
          status: 'pending',
          dispatchedAt: null,
          lastError: null,
        },
      });
      return operation;
    });

    return this.toView(updated);
  }

  private toView(row: {
    id: string;
    workspaceId: string;
    kind: AsyncOperationKind;
    status: AsyncOperationStatus;
    correlationId: string;
    resultJson: Prisma.JsonValue | null;
    errorMessage: string | null;
    attempts: number;
    createdAt: Date;
    updatedAt: Date;
    startedAt: Date | null;
    finishedAt: Date | null;
  }): OperationView {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      kind: row.kind,
      status: row.status,
      correlationId: row.correlationId,
      result: row.resultJson,
      errorMessage: row.errorMessage,
      attempts: row.attempts,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
    };
  }
}
