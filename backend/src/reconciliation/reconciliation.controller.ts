import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../identity/auth.types.js';
import { CurrentUser } from '../identity/current-user.decorator.js';
import { JwtAuthGuard } from '../identity/jwt-auth.guard.js';
import type { OperationView } from '../jobs/operations.service.js';
import {
  ReconciliationService,
  type ReconciliationRunView,
} from './reconciliation.service.js';

@ApiTags('reconciliation')
@ApiBearerAuth()
@Controller('reconciliation')
@UseGuards(JwtAuthGuard)
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Post('runs')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Enqueue a reconciliation run',
    description:
      'Returns 202 with an operationId. Poll GET /operations/:id; on success read result.runId then GET /reconciliation/runs/:runId.',
  })
  @ApiAcceptedResponse({ description: 'Reconciliation queued' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  enqueue(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OperationView> {
    return this.reconciliationService.enqueueRun(
      user.workspaceId,
      user.userId,
    );
  }

  @Get('runs/latest')
  @ApiOperation({ summary: 'Get the most recent reconciliation run' })
  latest(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReconciliationRunView> {
    return this.reconciliationService.getLatest(user.workspaceId);
  }

  @Get('runs/:runId')
  @ApiOperation({ summary: 'Get a reconciliation run by id' })
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('runId') runId: string,
  ): Promise<ReconciliationRunView> {
    return this.reconciliationService.getById(user.workspaceId, runId);
  }
}
