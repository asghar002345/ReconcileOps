import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../identity/auth.types.js';
import { CurrentUser } from '../identity/current-user.decorator.js';
import { JwtAuthGuard } from '../identity/jwt-auth.guard.js';
import { ListPaymentsQueryDto } from './dto/list-payments.query.dto.js';
import { PaymentsService } from './payments.service.js';
import type { PaymentPage } from './payments.types.js';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @ApiOperation({
    summary: 'List payments in the authenticated workspace',
    description:
      'Offset pagination via page/pageSize, or keyset via cursorPaidAt + cursorSourcePaymentId (Week 11). Workspace comes from membership. Amounts are fils strings.',
  })
  @ApiOkResponse({ description: 'Paginated payment list' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  listPayments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListPaymentsQueryDto,
  ): Promise<PaymentPage> {
    return this.paymentsService.listPayments({
      workspaceId: user.workspaceId,
      page: query.page,
      pageSize: query.pageSize,
      cursorPaidAt: query.cursorPaidAt,
      cursorSourcePaymentId: query.cursorSourcePaymentId,
    });
  }
}
