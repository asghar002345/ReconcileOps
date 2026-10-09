import {
  INestApplication,
  INestApplicationContext,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { startWorkerContext, waitForOperation } from './helpers/async-jobs.js';

async function runReconciliation(
  app: INestApplication<App>,
  token: string,
) {
  const queued = await request(app.getHttpServer())
    .post('/reconciliation/runs')
    .set('Authorization', `Bearer ${token}`)
    .expect(202);

  const done = await waitForOperation(app, token, queued.body.id as string);
  expect(done.status).toBe('succeeded');
  const runId = (done.result as { runId: string }).runId;

  const response = await request(app.getHttpServer())
    .get(`/reconciliation/runs/${runId}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  return response.body;
}

describe('Reconciliation (e2e)', () => {
  let app: INestApplication<App>;
  let worker: INestApplicationContext;
  let accessToken: string;

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

  it('rejects unauthenticated runs', async () => {
    await request(app.getHttpServer()).post('/reconciliation/runs').expect(401);
  });

  it('queues reconciliation and returns SPEC classifications for seeded data', async () => {
    const body = await runReconciliation(app, accessToken);

    expect(body.ruleVersion).toBe('exact-ref-net-window-v1');
    expect(body.summary.MATCHED).toBeGreaterThanOrEqual(1);
    expect(body.summary.AMOUNT_MISMATCH).toBeGreaterThanOrEqual(1);
    expect(
      body.summary.PAYMENT_WITHOUT_BANK_ENTRY,
    ).toBeGreaterThanOrEqual(1);
    expect(
      body.summary.BANK_ENTRY_WITHOUT_PAYMENT,
    ).toBeGreaterThanOrEqual(1);
    expect(body.summary.OUTSIDE_SETTLEMENT_WINDOW).toBeGreaterThanOrEqual(1);

    const mismatch = body.results.find(
      (row: { outcome: string; referenceNormalized: string }) =>
        row.outcome === 'AMOUNT_MISMATCH' &&
        row.referenceNormalized === 'REF-200',
    );
    expect(mismatch.differenceFils).toBe('-300');

    const latest = await request(app.getHttpServer())
      .get('/reconciliation/runs/latest')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(latest.body.id).toBe(body.id);
  });

  it('produces the same classifications when run twice on unchanged data', async () => {
    const first = await runReconciliation(app, accessToken);
    const second = await runReconciliation(app, accessToken);

    expect(second.summary).toEqual(first.summary);
    expect(
      second.results.map(
        (row: { outcome: string; referenceNormalized: string }) =>
          `${row.referenceNormalized}:${row.outcome}`,
      ),
    ).toEqual(
      first.results.map(
        (row: { outcome: string; referenceNormalized: string }) =>
          `${row.referenceNormalized}:${row.outcome}`,
      ),
    );
  });
});
