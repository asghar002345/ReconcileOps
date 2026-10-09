import {
  INestApplication,
  INestApplicationContext,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/database/prisma.service.js';
import { startWorkerContext, waitForOperation } from './helpers/async-jobs.js';

const fixtures = join(__dirname, 'fixtures', 'csv');

describe('Imports (e2e)', () => {
  let app: INestApplication<App>;
  let worker: INestApplicationContext;
  let prisma: PrismaService;
  let accessToken: string;
  let replayCsv: Buffer;
  let replaySources: string[];

  beforeAll(async () => {
    process.env.DATABASE_URL ??=
      'postgresql://reconcile:reconcile@127.0.0.1:5434/reconcileops';
    process.env.JWT_SECRET ??= 'dev-only-change-me-reconcileops';
    process.env.JWT_EXPIRES_IN ??= '1h';
    process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
    process.env.WEBHOOK_HMAC_SECRET ??= 'dev-only-webhook-hmac-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
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

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'analyst@demo.reconcileops.local',
        password: 'Password123!',
      })
      .expect(200);

    accessToken = login.body.accessToken as string;
  });

  afterAll(async () => {
    await worker.close();
    await app.close();
  });

  it('rejects an unauthenticated import', async () => {
    await request(app.getHttpServer())
      .post('/imports/payments')
      .attach('file', join(fixtures, 'payments-valid.csv'))
      .expect(401);
  });

  it('queues a valid payments CSV and publishes via the worker', async () => {
    const stamp = Date.now();
    const sourceA = `pay_e2e_${stamp}_a`;
    const sourceB = `pay_e2e_${stamp}_b`;
    const csv = Buffer.from(
      [
        'payment_id,reference,gross_amount,fee_amount,currency,paid_at',
        `${sourceA},REF-E2E-${stamp},100.00,3.00,AED,2026-10-01T10:00:00Z`,
        `${sourceB},"REF, QUOTED ${stamp}",50.00,1.50,AED,2026-10-01T11:00:00Z`,
        '',
      ].join('\n'),
    );

    const before = await prisma.payment.count({
      where: { workspaceId: 'ws_demo' },
    });

    const queued = await request(app.getHttpServer())
      .post('/imports/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', csv, `payments-${stamp}.csv`)
      .expect(202);

    expect(queued.body.status).toBe('queued');
    const done = await waitForOperation(app, accessToken, queued.body.id);
    expect(done.status).toBe('succeeded');
    expect(done.result?.rowCount).toBe(2);

    const after = await prisma.payment.count({
      where: { workspaceId: 'ws_demo' },
    });
    expect(after).toBe(before + 2);

    replayCsv = csv;
    replaySources = [sourceA, sourceB];
  });

  it('rejects an invalid amount and publishes no rows from that file', async () => {
    const before = await prisma.payment.count({
      where: { workspaceId: 'ws_demo' },
    });

    const response = await request(app.getHttpServer())
      .post('/imports/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', join(fixtures, 'payments-bad-amount.csv'))
      .expect(400);

    expect(response.body.message).toBe('CSV validation failed');
    expect(response.body.errors[0].field).toBe('gross_amount');

    const after = await prisma.payment.count({
      where: { workspaceId: 'ws_demo' },
    });
    expect(after).toBe(before);
  });

  it('rejects a bad header without writing a batch', async () => {
    const beforeBatches = await prisma.importBatch.count({
      where: { workspaceId: 'ws_demo', kind: 'payments' },
    });

    await request(app.getHttpServer())
      .post('/imports/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', join(fixtures, 'payments-bad-header.csv'))
      .expect(400);

    const afterBatches = await prisma.importBatch.count({
      where: { workspaceId: 'ws_demo', kind: 'payments' },
    });
    expect(afterBatches).toBe(beforeBatches);
  });

  it('replays an identical file without creating extra canonical payments', async () => {
    expect(replayCsv).toBeDefined();
    expect(replaySources).toBeDefined();

    const before = await prisma.payment.count({
      where: {
        workspaceId: 'ws_demo',
        sourcePaymentId: { in: replaySources },
      },
    });

    const response = await request(app.getHttpServer())
      .post('/imports/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', replayCsv, 'payments-replay.csv')
      .expect(200);

    expect(response.body.reused).toBe(true);

    const after = await prisma.payment.count({
      where: {
        workspaceId: 'ws_demo',
        sourcePaymentId: { in: replaySources },
      },
    });
    expect(after).toBe(before);
  });

  it('imports a valid bank CSV via the worker', async () => {
    const stamp = Date.now();
    const sourceId = `bank_e2e_${stamp}`;
    const csv = Buffer.from(
      [
        'bank_entry_id,reference,settled_amount,currency,settled_at',
        `${sourceId},REF-BANK-${stamp},97.00,AED,2026-10-02`,
        '',
      ].join('\n'),
    );

    const queued = await request(app.getHttpServer())
      .post('/imports/bank-entries')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', csv, `bank-${stamp}.csv`)
      .expect(202);

    const done = await waitForOperation(app, accessToken, queued.body.id);
    expect(done.status).toBe('succeeded');

    const entry = await prisma.bankEntry.findFirst({
      where: {
        workspaceId: 'ws_demo',
        sourceBankEntryId: sourceId,
      },
    });
    expect(entry?.settledAmountFils).toBe(9700n);
  });
});
