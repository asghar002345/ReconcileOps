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

async function login(
  app: INestApplication<App>,
  email: string,
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: 'Password123!' })
    .expect(200);
  return response.body.accessToken as string;
}

describe('Investigations (e2e)', () => {
  let app: INestApplication<App>;
  let worker: INestApplicationContext;
  let analystToken: string;
  let approverToken: string;

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

    analystToken = await login(app, 'analyst@demo.reconcileops.local');
    approverToken = await login(app, 'approver@demo.reconcileops.local');
  });

  afterAll(async () => {
    await worker.close();
    await app.close();
  });

  async function openFromMismatch() {
    const queued = await request(app.getHttpServer())
      .post('/reconciliation/runs')
      .set('Authorization', `Bearer ${analystToken}`)
      .expect(202);
    const done = await waitForOperation(app, analystToken, queued.body.id);
    expect(done.status).toBe('succeeded');
    const runId = (done.result as { runId: string }).runId;

    const run = await request(app.getHttpServer())
      .get(`/reconciliation/runs/${runId}`)
      .set('Authorization', `Bearer ${analystToken}`)
      .expect(200);

    const mismatch = run.body.results.find(
      (row: { outcome: string }) => row.outcome === 'AMOUNT_MISMATCH',
    );
    expect(mismatch).toBeTruthy();

    const created = await request(app.getHttpServer())
      .post('/investigations')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ reconciliationResultId: mismatch.id })
      .expect(201);

    return created.body as {
      id: string;
      version: number;
      status: string;
      proposals: Array<{ id: string; status: string }>;
    };
  }

  it('rejects unauthenticated access', async () => {
    await request(app.getHttpServer()).get('/investigations').expect(401);
  });

  it('analyst proposes and approver decides; analyst cannot decide', async () => {
    const investigation = await openFromMismatch();

    const noted = await request(app.getHttpServer())
      .post(`/investigations/${investigation.id}/notes`)
      .set('Authorization', `Bearer ${analystToken}`)
      .send({
        body: 'Bank fee of 3 AED confirmed with statement.',
        expectedVersion: investigation.version,
      })
      .expect(201);

    const proposed = await request(app.getHttpServer())
      .post(`/investigations/${investigation.id}/proposals`)
      .set('Authorization', `Bearer ${analystToken}`)
      .send({
        summary: 'Accept shortfall as merchant fee; close case.',
        expectedVersion: noted.body.version,
      })
      .expect(201);

    expect(proposed.body.status).toBe('PENDING_APPROVAL');
    const proposalId = proposed.body.proposals.find(
      (p: { status: string }) => p.status === 'PENDING',
    ).id as string;

    await request(app.getHttpServer())
      .post(
        `/investigations/${investigation.id}/proposals/${proposalId}/decide`,
      )
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ decision: 'APPROVED', expectedVersion: proposed.body.version })
      .expect(403);

    const decided = await request(app.getHttpServer())
      .post(
        `/investigations/${investigation.id}/proposals/${proposalId}/decide`,
      )
      .set('Authorization', `Bearer ${approverToken}`)
      .send({
        decision: 'APPROVED',
        expectedVersion: proposed.body.version,
        note: 'Fee matches contract.',
      })
      .expect(201);

    expect(decided.body.status).toBe('RESOLVED');
    expect(decided.body.version).toBe(proposed.body.version + 1);

    const detail = await request(app.getHttpServer())
      .get(`/investigations/${investigation.id}`)
      .set('Authorization', `Bearer ${approverToken}`)
      .expect(200);

    expect(detail.body.discrepancy.outcome).toBe('AMOUNT_MISMATCH');
    expect(
      detail.body.audit.some(
        (event: { action: string }) =>
          event.action === 'investigation.proposal_approved',
      ),
    ).toBe(true);
  });

  it('returns 409 on stale expectedVersion', async () => {
    const investigation = await openFromMismatch();

    await request(app.getHttpServer())
      .post(`/investigations/${investigation.id}/notes`)
      .set('Authorization', `Bearer ${analystToken}`)
      .send({
        body: 'First writer wins',
        expectedVersion: investigation.version,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/investigations/${investigation.id}/notes`)
      .set('Authorization', `Bearer ${analystToken}`)
      .send({
        body: 'Stale client',
        expectedVersion: investigation.version,
      })
      .expect(409);
  });

  it('rejects proposal when approver tries to create it', async () => {
    const investigation = await openFromMismatch();

    await request(app.getHttpServer())
      .post(`/investigations/${investigation.id}/proposals`)
      .set('Authorization', `Bearer ${approverToken}`)
      .send({
        summary: 'Approver should not propose',
        expectedVersion: investigation.version,
      })
      .expect(403);
  });
});
