import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Worker, type ConnectionOptions, type Job } from 'bullmq';
import { ImportsService } from '../imports/imports.service.js';
import { ReconciliationService } from '../reconciliation/reconciliation.service.js';
import { WebhooksService } from '../webhooks/webhooks.service.js';
import {
  JOB_IMPORT_BANK_ENTRIES,
  JOB_IMPORT_PAYMENTS,
  JOB_RECONCILIATION_RUN,
  JOB_WEBHOOK_PAYMENT_CAPTURED,
  RECONCILEOPS_QUEUE,
  type ImportJobPayload,
  type ReconciliationJobPayload,
  type WebhookJobPayload,
} from './jobs.constants.js';
import { OperationsService } from './operations.service.js';
import { BULLMQ_CONNECTION } from './queue.tokens.js';

@Injectable()
export class JobProcessorsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobProcessorsService.name);
  private worker: Worker | null = null;

  constructor(
    @Inject(BULLMQ_CONNECTION) private readonly connection: ConnectionOptions,
    private readonly operationsService: OperationsService,
    private readonly reconciliationService: ReconciliationService,
    private readonly importsService: ImportsService,
    private readonly webhooksService: WebhooksService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker(
      RECONCILEOPS_QUEUE,
      async (job) => this.handle(job),
      {
        connection: this.connection,
        concurrency: 2,
      },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.warn(
        `Job ${job?.id ?? '?'} failed: ${error.message}`,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
  }

  private async handle(job: Job): Promise<void> {
    if (job.name === JOB_RECONCILIATION_RUN) {
      await this.handleReconciliation(job.data as ReconciliationJobPayload);
      return;
    }
    if (
      job.name === JOB_IMPORT_PAYMENTS ||
      job.name === JOB_IMPORT_BANK_ENTRIES
    ) {
      await this.handleImport(job.data as ImportJobPayload, job.name);
      return;
    }
    if (job.name === JOB_WEBHOOK_PAYMENT_CAPTURED) {
      await this.handleWebhook(job.data as WebhookJobPayload);
      return;
    }
    throw new Error(`Unknown job name ${job.name}`);
  }

  private async handleWebhook(payload: WebhookJobPayload): Promise<void> {
    if (await this.operationsService.isTerminalSuccess(payload.operationId)) {
      return;
    }

    await this.operationsService.markRunning(payload.operationId);

    try {
      const result = await this.webhooksService.processAcceptedEvent(
        payload.webhookEventId,
      );
      await this.operationsService.markSucceeded(payload.operationId, {
        webhookEventId: payload.webhookEventId,
        paymentId: result.paymentId,
        sourcePaymentId: result.sourcePaymentId,
        createdPayment: result.createdPayment,
      });
    } catch (error) {
      await this.operationsService.markFailed(
        payload.operationId,
        this.errorMessage(error, 'Webhook processing failed'),
      );
      if (error instanceof BadRequestException) {
        return;
      }
      throw error;
    }
  }

  private async handleReconciliation(
    payload: ReconciliationJobPayload,
  ): Promise<void> {
    if (await this.operationsService.isTerminalSuccess(payload.operationId)) {
      return;
    }

    const claimed = await this.operationsService.markRunning(
      payload.operationId,
    );
    if (!claimed) {
      if (await this.operationsService.isTerminalSuccess(payload.operationId)) {
        return;
      }
    }

    try {
      const run = await this.reconciliationService.run(
        payload.workspaceId,
        payload.requestedByUserId,
      );
      await this.operationsService.markSucceeded(payload.operationId, {
        runId: run.id,
        resultCount: run.resultCount,
        summary: run.summary,
      });
    } catch (error) {
      await this.operationsService.markFailed(
        payload.operationId,
        this.errorMessage(error, 'Reconciliation failed'),
      );
      // Validation / domain failures are terminal; only rethrow unknowns for retry.
      if (error instanceof BadRequestException) {
        return;
      }
      throw error;
    }
  }

  private async handleImport(
    payload: ImportJobPayload,
    jobName: string,
  ): Promise<void> {
    if (await this.operationsService.isTerminalSuccess(payload.operationId)) {
      return;
    }

    await this.operationsService.markRunning(payload.operationId);

    try {
      const kind =
        jobName === JOB_IMPORT_PAYMENTS ? 'payments' : 'bank_entries';
      const summary = await this.importsService.processStagedImport(
        payload.workspaceId,
        kind,
        payload,
      );
      await this.operationsService.markSucceeded(payload.operationId, {
        batchId: summary.batchId,
        kind: summary.kind,
        reused: summary.reused,
        rowCount: summary.rowCount,
        fileName: summary.fileName,
        fileHashSha256: summary.fileHashSha256,
        status: summary.status,
      });
    } catch (error) {
      await this.operationsService.markFailed(
        payload.operationId,
        this.errorMessage(error, 'Import failed'),
      );
      if (error instanceof BadRequestException) {
        return;
      }
      throw error;
    }
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      return typeof response === 'string'
        ? response
        : JSON.stringify(response).slice(0, 2000);
    }
    if (error instanceof Error) {
      return error.message;
    }
    return fallback;
  }
}
