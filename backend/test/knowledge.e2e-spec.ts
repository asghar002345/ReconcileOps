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

describe('Knowledge explain (e2e)', () => {
  let app: INestApplication<App>;
  let worker: INestApplicationContext;
  let token: string;

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
    token = login.body.accessToken as string;
  });

  afterAll(async () => {
    await worker.close();
    await app.close();
  });

  it('explains an investigation with SQL amounts and policy citations', async () => {
    const queued = await request(app.getHttpServer())
      .post('/reconciliation/runs')
      .set('Authorization', `Bearer ${token}`)
      .expect(202);
    const done = await waitForOperation(app, token, queued.body.id);
    expect(done.status).toBe('succeeded');
    const runId = (done.result as { runId: string }).runId;

    const run = await request(app.getHttpServer())
      .get(`/reconciliation/runs/${runId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const mismatch = run.body.results.find(
      (row: { outcome: string }) => row.outcome === 'AMOUNT_MISMATCH',
    );
    expect(mismatch).toBeTruthy();

    const created = await request(app.getHttpServer())
      .post('/investigations')
      .set('Authorization', `Bearer ${token}`)
      .send({ reconciliationResultId: mismatch.id })
      .expect(201);

    const explained = await request(app.getHttpServer())
      .post(`/investigations/${created.body.id}/explain`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(explained.body.explanation.arithmetic.differenceAgreesWithSql).toBe(
      true,
    );
    expect(explained.body.explanation.arithmetic.differenceFils).toBe(
      mismatch.differenceFils,
    );
    expect(explained.body.explanation.citations.length).toBeGreaterThan(0);
    expect(
      explained.body.explanation.citations.every(
        (citation: { isDemoPolicy: boolean }) => citation.isDemoPolicy,
      ),
    ).toBe(true);
    expect(explained.body.explanation.uncertainty).toMatch(/SQL/i);
  });
});
