import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';

export const HEALTH_DATABASE = Symbol('HEALTH_DATABASE');

export interface HealthDatabase {
  ping(): Promise<void>;
}

@Injectable()
export class PgHealthDatabase implements HealthDatabase {
  constructor(private readonly configService: ConfigService) {}

  async ping(): Promise<void> {
    const connectionString =
      this.configService.getOrThrow<string>('DATABASE_URL');
    const client = new pg.Client({ connectionString });
    try {
      await client.connect();
      await client.query('SELECT 1');
    } finally {
      await client.end().catch(() => undefined);
    }
  }
}
