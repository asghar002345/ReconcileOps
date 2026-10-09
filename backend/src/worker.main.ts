import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerAppModule } from './worker.module.js';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerAppModule, {
    logger: ['error', 'warn', 'log'],
  });
  app.enableShutdownHooks();
  Logger.log('ReconcileOps worker started (outbox dispatcher + BullMQ)', 'Worker');
}

await bootstrap();
