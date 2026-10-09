import {
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { WebhooksService } from './webhooks.service.js';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('payments')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Ingest a signed payment.captured webhook (Week 8 async)',
    description:
      'Verifies HMAC, persists webhook_events + outbox in one txn, returns 200. Worker applies the payment effect. Poll GET /operations/:operationId when paymentId is still null.',
  })
  @ApiHeader({ name: 'X-ReconcileOps-Signature', required: true })
  @ApiHeader({ name: 'X-ReconcileOps-Timestamp', required: true })
  @ApiOkResponse({ description: 'Accepted (including safe replays)' })
  @ApiUnauthorizedResponse({ description: 'Bad signature or stale timestamp' })
  ingest(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-reconcileops-signature') signature?: string,
    @Headers('x-reconcileops-timestamp') timestamp?: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody || rawBody.length === 0) {
      throw new UnauthorizedException('Raw body required for signature check');
    }
    return this.webhooksService.ingestPaymentCaptured(
      rawBody,
      signature,
      timestamp,
    );
  }
}
