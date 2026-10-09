import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PrismaService } from '../database/prisma.service.js';
import type { JobName } from './jobs.constants.js';
import { BULLMQ_QUEUE } from './queue.tokens.js';

const POLL_MS = 1000;
const BATCH_SIZE = 20;

@Injectable()
export class OutboxDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcher.name);
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(BULLMQ_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, POLL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const pending = await this.prisma.outboxEvent.findMany({
        where: { status: 'pending' },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
      });

      for (const event of pending) {
        try {
          await this.queue.add(
            event.jobName,
            event.payloadJson,
            {
              jobId: event.id,
              removeOnComplete: 100,
              removeOnFail: 100,
              attempts: 3,
              backoff: { type: 'exponential', delay: 1000 },
            },
          );
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: 'dispatched',
              dispatchedAt: new Date(),
              dispatchAttempts: { increment: 1 },
              lastError: null,
            },
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Dispatch failed';
          this.logger.warn(
            `Outbox ${event.id} dispatch failed: ${message}`,
          );
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              dispatchAttempts: { increment: 1 },
              lastError: message.slice(0, 2000),
            },
          });
        }
      }
    } finally {
      this.ticking = false;
    }
  }

  /** Test helper: force one dispatch pass. */
  async flush(): Promise<void> {
    await this.tick();
  }

  assertJobName(name: string): asserts name is JobName {
    // runtime noop — job names are stored as strings
  }
}
