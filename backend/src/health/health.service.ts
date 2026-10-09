import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HEALTH_DATABASE, type HealthDatabase } from './health.database.js';

export type HealthReport = {
  status: 'ok';
  database: 'up';
};

@Injectable()
export class HealthService {
  constructor(
    @Inject(HEALTH_DATABASE) private readonly database: HealthDatabase,
  ) {}

  async check(): Promise<HealthReport> {
    try {
      await this.database.ping();
    } catch {
      throw new ServiceUnavailableException('Database is not reachable');
    }
    return { status: 'ok', database: 'up' };
  }
}
