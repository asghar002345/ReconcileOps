import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { KnowledgeController } from './knowledge.controller.js';
import { KnowledgeExplainService } from './knowledge-explain.service.js';
import { KnowledgeIngestService } from './knowledge-ingest.service.js';

@Module({
  imports: [IdentityModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeIngestService, KnowledgeExplainService],
  exports: [KnowledgeIngestService, KnowledgeExplainService],
})
export class KnowledgeModule {}
