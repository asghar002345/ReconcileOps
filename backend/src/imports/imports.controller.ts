import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import type { AuthenticatedUser } from '../identity/auth.types.js';
import { CurrentUser } from '../identity/current-user.decorator.js';
import { JwtAuthGuard } from '../identity/jwt-auth.guard.js';
import { MAX_IMPORT_BYTES } from './csv/contracts.js';
import { ImportsService } from './imports.service.js';

@ApiTags('imports')
@ApiBearerAuth()
@Controller('imports')
@UseGuards(JwtAuthGuard)
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post('payments')
  @ApiOperation({
    summary: 'Enqueue a payments CSV import (or reuse identical hash)',
    description:
      'Stages the file and returns 202 with an operationId to poll. Identical file hash returns 200 reused without a job.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiAcceptedResponse({ description: 'Import queued' })
  @ApiOkResponse({ description: 'Identical file already imported (reused)' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMPORT_BYTES },
    }),
  )
  async importPayments(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.importsService.enqueuePayments(
      user.workspaceId,
      user.userId,
      file,
    );
    if (result.mode === 'reused') {
      res.status(HttpStatus.OK);
      return result.summary;
    }
    res.status(HttpStatus.ACCEPTED);
    return result.operation;
  }

  @Post('bank-entries')
  @ApiOperation({
    summary: 'Enqueue a bank CSV import (or reuse identical hash)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiAcceptedResponse({ description: 'Import queued' })
  @ApiOkResponse({ description: 'Identical file already imported (reused)' })
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMPORT_BYTES },
    }),
  )
  async importBankEntries(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.importsService.enqueueBankEntries(
      user.workspaceId,
      user.userId,
      file,
    );
    if (result.mode === 'reused') {
      res.status(HttpStatus.OK);
      return result.summary;
    }
    res.status(HttpStatus.ACCEPTED);
    return result.operation;
  }
}
