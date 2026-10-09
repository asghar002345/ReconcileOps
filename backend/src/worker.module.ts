import { Module } from '@nestjs/common';
import { ConfigurationModule } from './configuration/configuration.module.js';
import { DatabaseModule } from './database/database.module.js';
import { ImportsModule } from './imports/imports.module.js';
import { OperationsModule } from './jobs/operations.module.js';
import { WorkerJobsModule } from './jobs/worker-jobs.module.js';
import { ReconciliationModule } from './reconciliation/reconciliation.module.js';

@Module({
  imports: [
    ConfigurationModule,
    DatabaseModule,
    ImportsModule,
    ReconciliationModule,
    OperationsModule,
    WorkerJobsModule,
  ],
})
export class WorkerAppModule {}
