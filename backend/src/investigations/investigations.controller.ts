import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../identity/auth.types.js';
import { CurrentUser } from '../identity/current-user.decorator.js';
import { JwtAuthGuard } from '../identity/jwt-auth.guard.js';
import {
  AddNoteDto,
  AssignInvestigationDto,
  CreateInvestigationDto,
  CreateProposalDto,
  DecideProposalDto,
} from './dto/investigation.dto.js';
import { InvestigationsService } from './investigations.service.js';

@ApiTags('investigations')
@ApiBearerAuth()
@Controller('investigations')
@UseGuards(JwtAuthGuard)
export class InvestigationsController {
  constructor(private readonly investigationsService: InvestigationsService) {}

  @Post()
  @ApiOperation({ summary: 'Open an investigation from a discrepancy result' })
  @ApiCreatedResponse({ description: 'Investigation created' })
  @ApiForbiddenResponse({ description: 'Requires analyst role' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateInvestigationDto,
  ) {
    return this.investigationsService.create(
      user,
      body.reconciliationResultId,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List investigations in the workspace' })
  @ApiOkResponse({ description: 'Investigation list' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.investigationsService.list(user.workspaceId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Investigation detail with notes, proposals, and audit',
  })
  @ApiOkResponse({ description: 'Investigation detail' })
  getDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.investigationsService.getDetail(user.workspaceId, id);
  }

  @Post(':id/assign')
  @ApiOperation({ summary: 'Assign investigation to a workspace member' })
  @ApiOkResponse({ description: 'Investigation updated' })
  @ApiConflictResponse({ description: 'Stale expectedVersion' })
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: AssignInvestigationDto,
  ) {
    return this.investigationsService.assign(
      user,
      id,
      body.assigneeUserId,
      body.expectedVersion,
    );
  }

  @Post(':id/notes')
  @ApiOperation({ summary: 'Add a note to an investigation' })
  @ApiOkResponse({ description: 'Investigation updated' })
  @ApiConflictResponse({ description: 'Stale expectedVersion' })
  addNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: AddNoteDto,
  ) {
    return this.investigationsService.addNote(
      user,
      id,
      body.body,
      body.expectedVersion,
    );
  }

  @Post(':id/proposals')
  @ApiOperation({ summary: 'Propose a resolution for approval' })
  @ApiOkResponse({ description: 'Investigation moved to PENDING_APPROVAL' })
  @ApiConflictResponse({
    description: 'Stale version or pending proposal already exists',
  })
  propose(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: CreateProposalDto,
  ) {
    return this.investigationsService.propose(
      user,
      id,
      body.summary,
      body.expectedVersion,
    );
  }

  @Post(':id/proposals/:proposalId/decide')
  @ApiOperation({ summary: 'Approve or reject a pending proposal' })
  @ApiOkResponse({ description: 'Decision recorded with audit' })
  @ApiForbiddenResponse({
    description: 'Requires approver role; cannot decide own proposal',
  })
  @ApiConflictResponse({ description: 'Stale version or proposal not pending' })
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('proposalId') proposalId: string,
    @Body() body: DecideProposalDto,
  ) {
    return this.investigationsService.decide(
      user,
      id,
      proposalId,
      body.decision,
      body.expectedVersion,
      body.note,
    );
  }
}
