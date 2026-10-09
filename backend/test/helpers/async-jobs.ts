import { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { WorkerAppModule } from '../../src/worker.module.js';

export async function startWorkerContext(): Promise<INestApplicationContext> {
  process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
  process.env.WEBHOOK_HMAC_SECRET ??= 'dev-only-webhook-hmac-secret';
  return NestFactory.createApplicationContext(WorkerAppModule, {
    logger: false,
  });
}

export async function waitForOperation(
  app: INestApplication<App>,
  token: string,
  operationId: string,
  timeoutMs = 15000,
): Promise<{
  id: string;
  status: string;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
}> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const response = await request(app.getHttpServer())
      .get(`/operations/${operationId}`)
      .set('Authorization', `Bearer ${token}`);
    if (response.status === 200) {
      if (
        response.body.status === 'succeeded' ||
        response.body.status === 'failed'
      ) {
        return response.body;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Operation ${operationId} did not finish in ${timeoutMs}ms`);
}
