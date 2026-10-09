import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ConfigurationModule } from './configuration/configuration.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { ImportsModule } from './imports/imports.module.js';
import { InvestigationsModule } from './investigations/investigations.module.js';
import { OperationsModule } from './jobs/operations.module.js';
import { KnowledgeModule } from './knowledge/knowledge.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { ReconciliationModule } from './reconciliation/reconciliation.module.js';
import { WebhooksModule } from './webhooks/webhooks.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigurationModule,
    DatabaseModule,
    HealthModule,
    IdentityModule,
    PaymentsModule,
    ImportsModule,
    ReconciliationModule,
    InvestigationsModule,
    WebhooksModule,
    OperationsModule,
    KnowledgeModule,
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'backend',
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
