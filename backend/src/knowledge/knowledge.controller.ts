import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../identity/auth.types.js';
import { CurrentUser } from '../identity/current-user.decorator.js';
import { JwtAuthGuard } from '../identity/jwt-auth.guard.js';
import { KnowledgeExplainService } from './knowledge-explain.service.js';

@ApiTags('knowledge')
@ApiBearerAuth()
@Controller('investigations')
@UseGuards(JwtAuthGuard)
export class KnowledgeController {
  constructor(private readonly explainService: KnowledgeExplainService) {}

  @Post(':id/explain')
  @ApiOperation({
    summary: 'Explain discrepancy (read-only RAG)',
    description:
      'Loads investigation evidence via SQL, retrieves demo policy chunks with pgvector, returns a structured explanation. Does not approve cases or rewrite amounts.',
  })
  @ApiCreatedResponse({ description: 'Explanation stored and returned' })
  explain(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.explainService.explain(
      user.workspaceId,
      id,
      user.userId,
    );
  }

  @Get(':id/explanations')
  @ApiOperation({ summary: 'List recent explanations for an investigation' })
  @ApiOkResponse({ description: 'Explanation history' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.explainService.listForInvestigation(user.workspaceId, id);
  }
}
