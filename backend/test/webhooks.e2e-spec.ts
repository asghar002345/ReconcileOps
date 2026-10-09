import {
  INestApplication,
  INestApplicationContext,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/database/prisma.service.js';
import { signWebhookPayload } from './../src/webhooks/webhook-signature.js';
import { startWorkerContext } from './helpers/async-jobs.js';

const SECRET = 'dev-only-webhook-hmac-secret';

function signedHeaders(rawBody: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signWebhookPayload(
    SECRET,
    timestamp,
    Buffer.from(rawBody, 'utf8'),
  );
  return {
    'Content-Type': 'application/json',
    'X-ReconcileOps-Timestamp': timestamp,
    'X-ReconcileOps-Signature': signature,
  };
}

function paymentCapturedBody(overrides: {
  eventId: string;
  businessOperationId: string;
  paymentId: string;
}) {
  return {
    eventId: overrides.eventId,
    businessOperationId: overrides.businessOperationId,
    providerAccountId: 'acct_paydemo_aed',
    type: 'payment.captured',
    data: {
      paymentId: overrides.paymentId,
      reference: 'ref-wh-demo',
      grossAmount: '50.00',
      feeAmount: '1.50',
      currency: 'AED',
      paidAt: '2026-10-08T10:00:00.000Z',
    },
  };
}

describe('Webhooks (e2e)', () => {
  let app: INestApplication<App>;
  let worker: INestApplicationContext;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.DATABASE_URL ??=
      'postgresql://reconcile:reconcile@127.0.0.1:5434/reconcileops';
    process.env.JWT_SECRET ??= 'dev-only-change-me-reconcileops';
    process.env.JWT_EXPIRES_IN ??= '1h';
    process.env.WEBHOOK_HMAC_SECRET = SECRET;
    process.env.WEBHOOK_TOLERANCE_SECONDS ??= '300';
    process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    worker = await startWorkerContext();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await worker.close();
    await app.close();
  });

  async function waitUntilProcessed(operationId: string) {
    // Webhook ops are not JWT-scoped the same way — poll via Prisma for e2e.
    const started = Date.now();
    while (Date.now() - started < 15000) {
      const op = await prisma.asyncOperation.findUnique({
        where: { id: operationId },
      });
      if (op?.status === 'succeeded' || op?.status === 'failed') {
        return op;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`Webhook operation ${operationId} did not finish`);
  }

  it('rejects an invalid signature without writing a payment', async () => {
    const body = JSON.stringify(
      paymentCapturedBody({
        eventId: `evt_bad_${Date.now()}`,
        businessOperationId: `op_bad_${Date.now()}`,
        paymentId: `pay_wh_bad_${Date.now()}`,
      }),
    );
    const headers = signedHeaders(body);
    headers['X-ReconcileOps-Signature'] = '00'.repeat(32);

    await request(app.getHttpServer())
      .post('/webhooks/payments')
      .set(headers)
      .send(body)
      .expect(401);
  });

  it('rejects a stale timestamp', async () => {
    const body = JSON.stringify(
      paymentCapturedBody({
        eventId: `evt_stale_${Date.now()}`,
        businessOperationId: `op_stale_${Date.now()}`,
        paymentId: `pay_wh_stale_${Date.now()}`,
      }),
    );
    const timestamp = String(Math.floor(Date.now() / 1000) - 3600);
    const signature = signWebhookPayload(
      SECRET,
      timestamp,
      Buffer.from(body, 'utf8'),
    );

    await request(app.getHttpServer())
      .post('/webhooks/payments')
      .set({
        'Content-Type': 'application/json',
        'X-ReconcileOps-Timestamp': timestamp,
        'X-ReconcileOps-Signature': signature,
      })
      .send(body)
      .expect(401);
  });

  it('accepts once, worker applies once across ten sequential deliveries', async () => {
    const suffix = `${Date.now()}_seq`;
    const payload = paymentCapturedBody({
      eventId: `evt_${suffix}`,
      businessOperationId: `op_${suffix}`,
      paymentId: `pay_wh_${suffix}`,
    });
    const body = JSON.stringify(payload);

    const first = await request(app.getHttpServer())
      .post('/webhooks/payments')
      .set(signedHeaders(body))
      .send(body)
      .expect(200);

    expect(first.body.reused).toBe(false);
    expect(first.body.status).toBe('accepted');
    expect(first.body.operationId).toBeTruthy();

    const done = await waitUntilProcessed(first.body.operationId as string);
    expect(done.status).toBe('succeeded');
    const paymentId = (done.resultJson as { paymentId: string }).paymentId;
    expect(paymentId).toBeTruthy();

    for (let i = 0; i < 9; i += 1) {
      const replay = await request(app.getHttpServer())
        .post('/webhooks/payments')
        .set(signedHeaders(body))
        .send(body)
        .expect(200);
      expect(replay.body.reused).toBe(true);
      expect(replay.body.paymentId).toBe(paymentId);
    }

    const payments = await prisma.payment.count({
      where: {
        workspaceId: 'ws_demo',
        sourcePaymentId: payload.data.paymentId,
      },
    });
    expect(payments).toBe(1);
  });

  it('keeps one business effect for two event ids of the same operation', async () => {
    const suffix = `${Date.now()}_op`;
    const firstPayload = paymentCapturedBody({
      eventId: `evt_a_${suffix}`,
      businessOperationId: `op_${suffix}`,
      paymentId: `pay_wh_${suffix}`,
    });
    const secondPayload = {
      ...firstPayload,
      eventId: `evt_b_${suffix}`,
    };
    const firstBody = JSON.stringify(firstPayload);
    const secondBody = JSON.stringify(secondPayload);

    const first = await request(app.getHttpServer())
      .post('/webhooks/payments')
      .set(signedHeaders(firstBody))
      .send(firstBody)
      .expect(200);

    const done = await waitUntilProcessed(first.body.operationId as string);
    expect(done.status).toBe('succeeded');
    const paymentId = (done.resultJson as { paymentId: string }).paymentId;

    const second = await request(app.getHttpServer())
      .post('/webhooks/payments')
      .set(signedHeaders(secondBody))
      .send(secondBody)
      .expect(200);

    expect(second.body.reusedOperation).toBe(true);
    expect(second.body.paymentId).toBe(paymentId);
  });

  it('survives concurrent identical deliveries with one payment effect', async () => {
    const suffix = `${Date.now()}_conc`;
    const payload = paymentCapturedBody({
      eventId: `evt_${suffix}`,
      businessOperationId: `op_${suffix}`,
      paymentId: `pay_wh_${suffix}`,
    });
    const body = JSON.stringify(payload);

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app.getHttpServer())
          .post('/webhooks/payments')
          .set(signedHeaders(body))
          .send(body),
      ),
    );

    expect(responses.every((response) => response.status === 200)).toBe(true);

    const operationIds = [
      ...new Set(
        responses
          .map((response) => response.body.operationId as string | null)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    expect(operationIds.length).toBe(1);

    const done = await waitUntilProcessed(operationIds[0]!);
    expect(done.status).toBe('succeeded');

    const payments = await prisma.payment.count({
      where: {
        workspaceId: 'ws_demo',
        sourcePaymentId: payload.data.paymentId,
      },
    });
    expect(payments).toBe(1);
  });
});
