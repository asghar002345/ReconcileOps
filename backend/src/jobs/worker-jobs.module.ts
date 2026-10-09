import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, type ConnectionOptions } from 'bullmq';
import { ImportsModule } from '../imports/imports.module.js';
import { ReconciliationModule } from '../reconciliation/reconciliation.module.js';
import { WebhooksModule } from '../webhooks/webhooks.module.js';
import { RECONCILEOPS_QUEUE } from './jobs.constants.js';
import { JobProcessorsService } from './job-processors.service.js';
import { OperationsModule } from './operations.module.js';
import { OutboxDispatcher } from './outbox.dispatcher.js';
import { BULLMQ_CONNECTION, BULLMQ_QUEUE } from './queue.tokens.js';
import { redisConnectionFromUrl } from './redis-connection.js';

@Module({
  imports: [
    OperationsModule,
    ImportsModule,
    ReconciliationModule,
    WebhooksModule,
  ],
  providers: [
    {
      provide: BULLMQ_CONNECTION,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ConnectionOptions =>
        redisConnectionFromUrl(config.getOrThrow<string>('REDIS_URL')),
    },
    {
      provide: BULLMQ_QUEUE,
      inject: [BULLMQ_CONNECTION],
      useFactory: (connection: ConnectionOptions) =>
        new Queue(RECONCILEOPS_QUEUE, { connection }),
    },
    OutboxDispatcher,
    JobProcessorsService,
  ],
})
export class WorkerJobsModule {}
