import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

describe('Payments (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken: string;

  beforeAll(async () => {
    process.env.DATABASE_URL ??=
      'postgresql://reconcile:reconcile@127.0.0.1:5434/reconcileops';
    process.env.JWT_SECRET ??= 'dev-only-change-me-reconcileops';
    process.env.JWT_EXPIRES_IN ??= '1h';

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
    await app.close();
  });

  it('rejects an unauthenticated payments list', async () => {
    await request(app.getHttpServer()).get('/payments').expect(401);
  });

  it('returns seeded payments for an authenticated analyst', async () => {
    const response = await request(app.getHttpServer())
      .get('/payments')
      .query({ page: 1, pageSize: 10 })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.totalItems).toBeGreaterThanOrEqual(4);
    expect(response.body.items[0].grossAmountFils).toEqual(expect.any(String));
    expect(
      response.body.items.some(
        (item: { sourcePaymentId: string }) =>
          item.sourcePaymentId === 'pay_1001',
      ),
    ).toBe(true);
  });

  it('paginates with pageSize=1', async () => {
    const page1 = await request(app.getHttpServer())
      .get('/payments')
      .query({ page: 1, pageSize: 1 })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const page2 = await request(app.getHttpServer())
      .get('/payments')
      .query({ page: 2, pageSize: 1 })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(page1.body.items).toHaveLength(1);
    expect(page2.body.items).toHaveLength(1);
    expect(page1.body.items[0].sourcePaymentId).not.toBe(
      page2.body.items[0].sourcePaymentId,
    );
    expect(page1.body.totalPages).toBeGreaterThanOrEqual(4);
  });
});
