import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { InvestigationsController } from './investigations.controller.js';
import { InvestigationsService } from './investigations.service.js';

@Module({
  imports: [IdentityModule],
  controllers: [InvestigationsController],
  providers: [InvestigationsService],
  exports: [InvestigationsService],
})
export class InvestigationsModule {}
