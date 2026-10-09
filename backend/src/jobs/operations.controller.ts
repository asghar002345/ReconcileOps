import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../identity/auth.types.js';
import { CurrentUser } from '../identity/current-user.decorator.js';
import { JwtAuthGuard } from '../identity/jwt-auth.guard.js';
import { OperationsService } from './operations.service.js';

@ApiTags('operations')
@ApiBearerAuth()
@Controller('operations')
@UseGuards(JwtAuthGuard)
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Poll async operation status' })
  @ApiOkResponse({ description: 'Operation status and result payload' })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.operationsService.getById(user.workspaceId, id);
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Re-queue a failed operation' })
  retry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.operationsService.retryFailed(user.workspaceId, id);
  }
}
