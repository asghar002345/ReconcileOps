import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';

/** Logs slow requests so queue backlog / import spikes are visible in stdout. */
@Injectable()
export class TimingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HttpTiming');
  private readonly thresholdMs = 200;

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const request = context.switchToHttp().getRequest<Request>();
    const started = Date.now();
    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - started;
        if (ms >= this.thresholdMs) {
          this.logger.warn(
            `${request.method} ${request.url} ${ms}ms`,
          );
        }
      }),
    );
  }
}
