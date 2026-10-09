import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

describe('Identity (e2e)', () => {
  let app: INestApplication<App>;

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('logs in a seeded analyst and returns their membership role', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'analyst@demo.reconcileops.local',
        password: 'Password123!',
      })
      .expect(200);

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.user.role).toBe('analyst');
    expect(response.body.user.workspaceId).toBe('ws_demo');
  });

  it('rejects a forged role field on login instead of trusting it', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'analyst@demo.reconcileops.local',
        password: 'Password123!',
        role: 'approver',
      })
      .expect(400);
  });

  it('rejects a wrong password', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'analyst@demo.reconcileops.local',
        password: 'not-the-password',
      })
      .expect(401);
  });

  it('rejects /auth/me without a token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('returns the actor from the database for a valid token', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'approver@demo.reconcileops.local',
        password: 'Password123!',
      })
      .expect(200);

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken as string}`)
      .expect(200);

    expect(me.body).toMatchObject({
      email: 'approver@demo.reconcileops.local',
      role: 'approver',
      workspaceId: 'ws_demo',
    });
  });
});
