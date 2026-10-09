import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import {
  decimalToFils,
  normalizeReference,
} from '../imports/csv/money.js';
import { JOB_WEBHOOK_PAYMENT_CAPTURED } from '../jobs/jobs.constants.js';
import {
  isTimestampFresh,
  verifyWebhookSignature,
} from './webhook-signature.js';

const WORKSPACE_ID = 'ws_demo';
const SUPPORTED_PROVIDER = 'acct_paydemo_aed';
const SUPPORTED_TYPE = 'payment.captured';
const SYSTEM_ACTOR = 'system_webhook';

export type PaymentCapturedPayload = {
  eventId: string;
  businessOperationId: string;
  providerAccountId: string;
  type: string;
  data: {
    paymentId: string;
    reference: string;
    grossAmount: string;
    feeAmount: string;
    currency: string;
    paidAt: string;
  };
};

export type WebhookIngestResult = {
  accepted: true;
  reused: boolean;
  reusedOperation: boolean;
  eventId: string;
  businessOperationId: string;
  operationId: string | null;
  status: 'accepted' | 'processed' | 'failed';
  paymentId: string | null;
  sourcePaymentId: string | null;
};

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Verify signature, persist webhook_events + async_operations + outbox_events
   * in one transaction, then acknowledge. Domain effect runs in the worker.
   */
  async ingestPaymentCaptured(
    rawBody: Buffer,
    signatureHeader: string | undefined,
    timestampHeader: string | undefined,
  ): Promise<WebhookIngestResult> {
    this.assertSignature(rawBody, signatureHeader, timestampHeader);

    let payload: PaymentCapturedPayload;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as PaymentCapturedPayload;
    } catch {
      throw new BadRequestException('Body must be valid JSON');
    }

    this.assertPayloadShape(payload);
    this.assertMoneyFields(payload);

    const existingByEvent = await this.prisma.webhookEvent.findUnique({
      where: {
        workspaceId_providerAccountId_eventId: {
          workspaceId: WORKSPACE_ID,
          providerAccountId: payload.providerAccountId,
          eventId: payload.eventId,
        },
      },
    });
    if (existingByEvent) {
      return this.toIngestResult(existingByEvent, payload, {
        reused: true,
        reusedOperation: false,
      });
    }

    const existingByOperation = await this.prisma.webhookEvent.findUnique({
      where: {
        workspaceId_providerAccountId_businessOperationId: {
          workspaceId: WORKSPACE_ID,
          providerAccountId: payload.providerAccountId,
          businessOperationId: payload.businessOperationId,
        },
      },
    });
    if (existingByOperation) {
      return this.toIngestResult(existingByOperation, payload, {
        reused: false,
        reusedOperation: true,
      });
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const operation = await tx.asyncOperation.create({
          data: {
            workspaceId: WORKSPACE_ID,
            kind: 'webhook_payment_captured',
            status: 'queued',
            requestedByUserId: SYSTEM_ACTOR,
            correlationId: randomUUID(),
          },
        });

        const event = await tx.webhookEvent.create({
          data: {
            workspaceId: WORKSPACE_ID,
            providerAccountId: payload.providerAccountId,
            eventId: payload.eventId,
            businessOperationId: payload.businessOperationId,
            eventType: payload.type,
            status: 'accepted',
            payloadJson: payload as unknown as Prisma.InputJsonValue,
            operationId: operation.id,
            processedAt: null,
          },
        });

        await tx.outboxEvent.create({
          data: {
            workspaceId: WORKSPACE_ID,
            operationId: operation.id,
            jobName: JOB_WEBHOOK_PAYMENT_CAPTURED,
            payloadJson: {
              operationId: operation.id,
              workspaceId: WORKSPACE_ID,
              webhookEventId: event.id,
            },
            status: 'pending',
          },
        });

        return event;
      });

      return this.toIngestResult(created, payload, {
        reused: false,
        reusedOperation: false,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner =
          (await this.prisma.webhookEvent.findUnique({
            where: {
              workspaceId_providerAccountId_eventId: {
                workspaceId: WORKSPACE_ID,
                providerAccountId: payload.providerAccountId,
                eventId: payload.eventId,
              },
            },
          })) ??
          (await this.prisma.webhookEvent.findUnique({
            where: {
              workspaceId_providerAccountId_businessOperationId: {
                workspaceId: WORKSPACE_ID,
                providerAccountId: payload.providerAccountId,
                businessOperationId: payload.businessOperationId,
              },
            },
          }));
        if (winner) {
          return this.toIngestResult(winner, payload, {
            reused: winner.eventId === payload.eventId,
            reusedOperation: winner.eventId !== payload.eventId,
          });
        }
      }
      throw error;
    }
  }

  /** Worker: apply payment + audit + mark webhook processed in one txn. */
  async processAcceptedEvent(webhookEventId: string): Promise<{
    paymentId: string;
    sourcePaymentId: string;
    createdPayment: boolean;
  }> {
    const event = await this.prisma.webhookEvent.findUnique({
      where: { id: webhookEventId },
    });
    if (!event) {
      throw new BadRequestException('Webhook event not found');
    }
    if (event.status === 'processed' && event.paymentId) {
      const payload = event.payloadJson as PaymentCapturedPayload;
      return {
        paymentId: event.paymentId,
        sourcePaymentId: payload.data.paymentId,
        createdPayment: false,
      };
    }

    const payload = event.payloadJson as PaymentCapturedPayload;
    const money = this.assertMoneyFields(payload);
    const paidAt = new Date(payload.data.paidAt);

    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.webhookEvent.findUnique({
        where: { id: webhookEventId },
      });
      if (!locked) {
        throw new BadRequestException('Webhook event not found');
      }
      if (locked.status === 'processed' && locked.paymentId) {
        return {
          paymentId: locked.paymentId,
          sourcePaymentId: payload.data.paymentId,
          createdPayment: false,
        };
      }

      const existingPayment = await tx.payment.findUnique({
        where: {
          workspaceId_providerAccountId_sourcePaymentId: {
            workspaceId: WORKSPACE_ID,
            providerAccountId: payload.providerAccountId,
            sourcePaymentId: payload.data.paymentId,
          },
        },
      });

      const payment =
        existingPayment ??
        (await tx.payment.create({
          data: {
            workspaceId: WORKSPACE_ID,
            providerAccountId: payload.providerAccountId,
            sourcePaymentId: payload.data.paymentId,
            referenceOriginal: payload.data.reference,
            referenceNormalized: normalizeReference(payload.data.reference),
            grossAmountFils: money.grossFils,
            feeAmountFils: money.feeFils,
            currency: 'AED',
            paidAt,
          },
        }));

      await tx.webhookEvent.update({
        where: { id: webhookEventId },
        data: {
          status: 'processed',
          paymentId: payment.id,
          processedAt: new Date(),
        },
      });

      await tx.auditEvent.create({
        data: {
          workspaceId: WORKSPACE_ID,
          actorUserId: SYSTEM_ACTOR,
          action: 'webhook.payment_captured',
          entityType: 'payment',
          entityId: payment.id,
          afterJson: {
            eventId: payload.eventId,
            businessOperationId: payload.businessOperationId,
            sourcePaymentId: payload.data.paymentId,
            createdPayment: !existingPayment,
            webhookEventId,
          },
        },
      });

      return {
        paymentId: payment.id,
        sourcePaymentId: payload.data.paymentId,
        createdPayment: !existingPayment,
      };
    });
  }

  private toIngestResult(
    event: {
      eventId: string;
      businessOperationId: string;
      operationId: string | null;
      status: 'accepted' | 'processed' | 'failed';
      paymentId: string | null;
    },
    payload: PaymentCapturedPayload,
    flags: { reused: boolean; reusedOperation: boolean },
  ): WebhookIngestResult {
    return {
      accepted: true,
      reused: flags.reused,
      reusedOperation: flags.reusedOperation,
      eventId: event.eventId,
      businessOperationId: event.businessOperationId,
      operationId: event.operationId,
      status: event.status,
      paymentId: event.paymentId,
      sourcePaymentId: payload.data.paymentId,
    };
  }

  private assertMoneyFields(payload: PaymentCapturedPayload): {
    grossFils: bigint;
    feeFils: bigint;
  } {
    const gross = decimalToFils(payload.data.grossAmount);
    const fee = decimalToFils(payload.data.feeAmount);
    if (!gross.ok) {
      throw new BadRequestException(`grossAmount: ${gross.message}`);
    }
    if (!fee.ok) {
      throw new BadRequestException(`feeAmount: ${fee.message}`);
    }
    if (payload.data.currency !== 'AED') {
      throw new BadRequestException('Only AED is supported');
    }
    const paidAt = new Date(payload.data.paidAt);
    if (Number.isNaN(paidAt.getTime())) {
      throw new BadRequestException('paidAt must be a valid ISO timestamp');
    }
    return { grossFils: gross.fils, feeFils: fee.fils };
  }

  private assertSignature(
    rawBody: Buffer,
    signatureHeader: string | undefined,
    timestampHeader: string | undefined,
  ): void {
    if (!signatureHeader || !timestampHeader) {
      throw new UnauthorizedException(
        'Missing X-ReconcileOps-Signature or X-ReconcileOps-Timestamp',
      );
    }
    if (!/^\d+$/.test(timestampHeader)) {
      throw new UnauthorizedException('Timestamp must be unix seconds');
    }

    const tolerance = this.configService.getOrThrow<number>(
      'WEBHOOK_TOLERANCE_SECONDS',
    );
    const nowSeconds = Math.floor(Date.now() / 1000);
    const timestampSeconds = Number(timestampHeader);
    if (!isTimestampFresh(timestampSeconds, nowSeconds, tolerance)) {
      throw new UnauthorizedException('Timestamp outside tolerance window');
    }

    const secret = this.configService.getOrThrow<string>('WEBHOOK_HMAC_SECRET');
    if (
      !verifyWebhookSignature(secret, timestampHeader, rawBody, signatureHeader)
    ) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  private assertPayloadShape(payload: PaymentCapturedPayload): void {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Invalid payload');
    }
    if (payload.type !== SUPPORTED_TYPE) {
      throw new BadRequestException(
        `Unsupported event type; only ${SUPPORTED_TYPE} is accepted`,
      );
    }
    if (payload.providerAccountId !== SUPPORTED_PROVIDER) {
      throw new BadRequestException(
        `Unknown providerAccountId; expected ${SUPPORTED_PROVIDER}`,
      );
    }
    if (
      typeof payload.eventId !== 'string' ||
      payload.eventId.trim() === '' ||
      typeof payload.businessOperationId !== 'string' ||
      payload.businessOperationId.trim() === ''
    ) {
      throw new BadRequestException(
        'eventId and businessOperationId are required',
      );
    }
    const data = payload.data;
    if (
      !data ||
      typeof data.paymentId !== 'string' ||
      typeof data.reference !== 'string' ||
      typeof data.grossAmount !== 'string' ||
      typeof data.feeAmount !== 'string' ||
      typeof data.currency !== 'string' ||
      typeof data.paidAt !== 'string'
    ) {
      throw new BadRequestException('data fields are incomplete');
    }
  }
}
