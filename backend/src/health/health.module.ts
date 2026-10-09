import { Module } from '@nestjs/common';
import { HEALTH_DATABASE, PgHealthDatabase } from './health.database.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    {
      provide: HEALTH_DATABASE,
      useClass: PgHealthDatabase,
    },
  ],
})
export class HealthModule {}
