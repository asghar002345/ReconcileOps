import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaService } from '../database/prisma.service.js';
import {
  JOB_IMPORT_BANK_ENTRIES,
  JOB_IMPORT_PAYMENTS,
  type ImportJobPayload,
} from '../jobs/jobs.constants.js';
import {
  OperationsService,
  type OperationView,
} from '../jobs/operations.service.js';
import {
  BANK_HEADERS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  PAYMENT_HEADERS,
  PROVIDER_ACCOUNT_ID,
  type ImportRowError,
} from './csv/contracts.js';
import { assertHeaders, parseCsvBuffer } from './csv/parse-csv.js';
import {
  validateBankRecords,
  validatePaymentRecords,
} from './csv/validate-rows.js';

export type ImportBatchSummary = {
  batchId: string;
  kind: 'payments' | 'bank_entries';
  status: 'published';
  fileName: string;
  fileHashSha256: string;
  rowCount: number;
  reused: boolean;
};

export type EnqueueImportResult =
  | { mode: 'reused'; summary: ImportBatchSummary }
  | { mode: 'queued'; operation: OperationView };

const STAGING_DIR = path.resolve(process.cwd(), 'storage', 'imports');

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operationsService: OperationsService,
  ) {}

  async enqueuePayments(
    workspaceId: string,
    requestedByUserId: string,
    file: Express.Multer.File,
  ): Promise<EnqueueImportResult> {
    return this.enqueue(workspaceId, requestedByUserId, 'payments', file);
  }

  async enqueueBankEntries(
    workspaceId: string,
    requestedByUserId: string,
    file: Express.Multer.File,
  ): Promise<EnqueueImportResult> {
    return this.enqueue(workspaceId, requestedByUserId, 'bank_entries', file);
  }

  /** Worker entry: validate + publish from staged bytes. No open txn across parse. */
  async processStagedImport(
    workspaceId: string,
    kind: 'payments' | 'bank_entries',
    payload: ImportJobPayload,
  ): Promise<ImportBatchSummary> {
    const buffer = await readFile(payload.stagingPath);
    try {
      if (kind === 'payments') {
        return await this.importPaymentsBuffer(
          workspaceId,
          buffer,
          payload.fileName,
          payload.fileHashSha256,
        );
      }
      return await this.importBankEntriesBuffer(
        workspaceId,
        buffer,
        payload.fileName,
        payload.fileHashSha256,
      );
    } finally {
      await unlink(payload.stagingPath).catch(() => undefined);
    }
  }

  private async enqueue(
    workspaceId: string,
    requestedByUserId: string,
    kind: 'payments' | 'bank_entries',
    file: Express.Multer.File,
  ): Promise<EnqueueImportResult> {
    const { buffer, fileName, fileHash } = this.readUpload(file);

    const existing = await this.findExistingBatch(workspaceId, kind, fileHash);
    if (existing) {
      return { mode: 'reused', summary: this.toSummary(existing, true) };
    }

    // Bounded parse/validate on the API so clients get HTTP 400 immediately.
    // Publish still happens in the worker (no long DB txn across parsing there).
    if (kind === 'payments') {
      await this.assertPaymentsValid(workspaceId, buffer);
    } else {
      await this.assertBankEntriesValid(workspaceId, buffer);
    }

    await mkdir(STAGING_DIR, { recursive: true });
    const stagingName = `${Date.now()}-${fileHash.slice(0, 12)}.csv`;
    const stagingPath = path.join(STAGING_DIR, stagingName);
    await writeFile(stagingPath, buffer);

    const jobName =
      kind === 'payments' ? JOB_IMPORT_PAYMENTS : JOB_IMPORT_BANK_ENTRIES;
    const operationKind =
      kind === 'payments' ? 'import_payments' : 'import_bank_entries';

    try {
      const operation = await this.operationsService.enqueue(
        workspaceId,
        requestedByUserId,
        operationKind,
        jobName,
        {
          stagingPath,
          fileName,
          fileHashSha256: fileHash,
        },
      );
      return { mode: 'queued', operation };
    } catch (error) {
      await unlink(stagingPath).catch(() => undefined);
      throw error;
    }
  }

  private async assertPaymentsValid(
    workspaceId: string,
    buffer: Buffer,
  ): Promise<void> {
    const { headers, records } = parseCsvBuffer(buffer);
    this.ensureRowBudget(records.length);
    const headerError = assertHeaders(headers, PAYMENT_HEADERS);
    if (headerError) {
      throw new BadRequestException({
        message: 'CSV validation failed',
        errors: [headerError],
      });
    }
    const { rows, errors } = validatePaymentRecords(records);
    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'CSV validation failed',
        errors,
      });
    }
    const conflictErrors = await this.findPaymentSourceConflicts(
      workspaceId,
      rows.map((row) => ({
        rowNumber: row.rowNumber,
        sourceId: row.sourcePaymentId,
      })),
    );
    if (conflictErrors.length > 0) {
      throw new BadRequestException({
        message: 'CSV validation failed',
        errors: conflictErrors,
      });
    }
  }

  private async assertBankEntriesValid(
    workspaceId: string,
    buffer: Buffer,
  ): Promise<void> {
    const { headers, records } = parseCsvBuffer(buffer);
    this.ensureRowBudget(records.length);
    const headerError = assertHeaders(headers, BANK_HEADERS);
    if (headerError) {
      throw new BadRequestException({
        message: 'CSV validation failed',
        errors: [headerError],
      });
    }
    const { rows, errors } = validateBankRecords(records);
    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'CSV validation failed',
        errors,
      });
    }
    const conflictErrors = await this.findBankSourceConflicts(
      workspaceId,
      rows.map((row) => ({
        rowNumber: row.rowNumber,
        sourceId: row.sourceBankEntryId,
      })),
    );
    if (conflictErrors.length > 0) {
      throw new BadRequestException({
        message: 'CSV validation failed',
        errors: conflictErrors,
      });
    }
  }

  private async importPaymentsBuffer(
    workspaceId: string,
    buffer: Buffer,
    fileName: string,
    fileHash: string,
  ): Promise<ImportBatchSummary> {
    const existing = await this.findExistingBatch(
      workspaceId,
      'payments',
      fileHash,
    );
    if (existing) {
      return this.toSummary(existing, true);
    }

    const { headers, records } = parseCsvBuffer(buffer);
    this.ensureRowBudget(records.length);
    const headerError = assertHeaders(headers, PAYMENT_HEADERS);
    if (headerError) {
      throw new BadRequestException({
        message: 'CSV validation failed',
        errors: [headerError],
      });
    }

    const { rows, errors } = validatePaymentRecords(records);
    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'CSV validation failed',
        errors,
      });
    }

    const conflictErrors = await this.findPaymentSourceConflicts(
      workspaceId,
      rows.map((row) => ({
        rowNumber: row.rowNumber,
        sourceId: row.sourcePaymentId,
      })),
    );
    if (conflictErrors.length > 0) {
      throw new BadRequestException({
        message: 'CSV validation failed',
        errors: conflictErrors,
      });
    }

    const batch = await this.prisma.$transaction(async (tx) => {
      const created = await tx.importBatch.create({
        data: {
          workspaceId,
          providerAccountId: PROVIDER_ACCOUNT_ID,
          kind: 'payments',
          status: 'published',
          fileName,
          fileHashSha256: fileHash,
          rowCount: rows.length,
        },
      });

      for (const row of rows) {
        await tx.importRow.create({
          data: {
            batchId: created.id,
            rowNumber: row.rowNumber,
            sourceId: row.sourcePaymentId,
            rawPayload: row.rawPayload,
          },
        });
        await tx.payment.create({
          data: {
            workspaceId,
            providerAccountId: PROVIDER_ACCOUNT_ID,
            sourcePaymentId: row.sourcePaymentId,
            referenceOriginal: row.referenceOriginal,
            referenceNormalized: row.referenceNormalized,
            grossAmountFils: row.grossAmountFils,
            feeAmountFils: row.feeAmountFils,
            currency: row.currency,
            paidAt: row.paidAt,
            importBatchId: created.id,
          },
        });
      }

      return created;
    });

    return this.toSummary(batch, false);
  }

  private async importBankEntriesBuffer(
    workspaceId: string,
    buffer: Buffer,
    fileName: string,
    fileHash: string,
  ): Promise<ImportBatchSummary> {
    const existing = await this.findExistingBatch(
      workspaceId,
      'bank_entries',
      fileHash,
    );
    if (existing) {
      return this.toSummary(existing, true);
    }

    const { headers, records } = parseCsvBuffer(buffer);
    this.ensureRowBudget(records.length);
    const headerError = assertHeaders(headers, BANK_HEADERS);
    if (headerError) {
      throw new BadRequestException({
        message: 'CSV validation failed',
        errors: [headerError],
      });
    }

    const { rows, errors } = validateBankRecords(records);
    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'CSV validation failed',
        errors,
      });
    }

    const conflictErrors = await this.findBankSourceConflicts(
      workspaceId,
      rows.map((row) => ({
        rowNumber: row.rowNumber,
        sourceId: row.sourceBankEntryId,
      })),
    );
    if (conflictErrors.length > 0) {
      throw new BadRequestException({
        message: 'CSV validation failed',
        errors: conflictErrors,
      });
    }

    const batch = await this.prisma.$transaction(async (tx) => {
      const created = await tx.importBatch.create({
        data: {
          workspaceId,
          providerAccountId: PROVIDER_ACCOUNT_ID,
          kind: 'bank_entries',
          status: 'published',
          fileName,
          fileHashSha256: fileHash,
          rowCount: rows.length,
        },
      });

      for (const row of rows) {
        await tx.importRow.create({
          data: {
            batchId: created.id,
            rowNumber: row.rowNumber,
            sourceId: row.sourceBankEntryId,
            rawPayload: row.rawPayload,
          },
        });
        await tx.bankEntry.create({
          data: {
            workspaceId,
            providerAccountId: PROVIDER_ACCOUNT_ID,
            sourceBankEntryId: row.sourceBankEntryId,
            referenceOriginal: row.referenceOriginal,
            referenceNormalized: row.referenceNormalized,
            settledAmountFils: row.settledAmountFils,
            currency: row.currency,
            settledAt: row.settledAt,
            importBatchId: created.id,
          },
        });
      }

      return created;
    });

    return this.toSummary(batch, false);
  }

  private readUpload(file: Express.Multer.File): {
    buffer: Buffer;
    fileName: string;
    fileHash: string;
  } {
    if (!file) {
      throw new BadRequestException({
        message: 'CSV validation failed',
        errors: [
          {
            rowNumber: 0,
            field: 'file',
            message: 'multipart field "file" is required',
          },
        ],
      });
    }

    if (file.size > MAX_IMPORT_BYTES) {
      throw new PayloadTooLargeException(
        `File exceeds the ${MAX_IMPORT_BYTES} byte limit`,
      );
    }

    const originalName = file.originalname || 'upload.csv';
    const looksLikeCsv =
      originalName.toLowerCase().endsWith('.csv') ||
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'application/csv' ||
      file.mimetype === 'text/plain';

    if (!looksLikeCsv) {
      throw new BadRequestException({
        message: 'CSV validation failed',
        errors: [
          {
            rowNumber: 0,
            field: 'file',
            message: 'Only CSV uploads are accepted',
          },
        ],
      });
    }

    const buffer = file.buffer;
    const fileHash = createHash('sha256').update(buffer).digest('hex');
    return { buffer, fileName: originalName, fileHash };
  }

  private ensureRowBudget(rowCount: number): void {
    if (rowCount === 0) {
      throw new BadRequestException({
        message: 'CSV validation failed',
        errors: [
          {
            rowNumber: 0,
            field: 'rows',
            message: 'CSV must contain at least one data row',
          },
        ],
      });
    }
    if (rowCount > MAX_IMPORT_ROWS) {
      throw new BadRequestException({
        message: 'CSV validation failed',
        errors: [
          {
            rowNumber: 0,
            field: 'rows',
            message: `CSV exceeds the ${MAX_IMPORT_ROWS} row limit`,
          },
        ],
      });
    }
  }

  private findExistingBatch(
    workspaceId: string,
    kind: 'payments' | 'bank_entries',
    fileHash: string,
  ) {
    return this.prisma.importBatch.findUnique({
      where: {
        workspaceId_providerAccountId_kind_fileHashSha256: {
          workspaceId,
          providerAccountId: PROVIDER_ACCOUNT_ID,
          kind,
          fileHashSha256: fileHash,
        },
      },
    });
  }

  private async findPaymentSourceConflicts(
    workspaceId: string,
    rows: Array<{ rowNumber: number; sourceId: string }>,
  ): Promise<ImportRowError[]> {
    const existing = await this.prisma.payment.findMany({
      where: {
        workspaceId,
        providerAccountId: PROVIDER_ACCOUNT_ID,
        sourcePaymentId: { in: rows.map((row) => row.sourceId) },
      },
      select: { sourcePaymentId: true },
    });
    const existingIds = new Set(existing.map((row) => row.sourcePaymentId));
    return rows
      .filter((row) => existingIds.has(row.sourceId))
      .map((row) => ({
        rowNumber: row.rowNumber,
        field: 'payment_id',
        message: `payment_id ${row.sourceId} already exists from another import`,
      }));
  }

  private async findBankSourceConflicts(
    workspaceId: string,
    rows: Array<{ rowNumber: number; sourceId: string }>,
  ): Promise<ImportRowError[]> {
    const existing = await this.prisma.bankEntry.findMany({
      where: {
        workspaceId,
        providerAccountId: PROVIDER_ACCOUNT_ID,
        sourceBankEntryId: { in: rows.map((row) => row.sourceId) },
      },
      select: { sourceBankEntryId: true },
    });
    const existingIds = new Set(existing.map((row) => row.sourceBankEntryId));
    return rows
      .filter((row) => existingIds.has(row.sourceId))
      .map((row) => ({
        rowNumber: row.rowNumber,
        field: 'bank_entry_id',
        message: `bank_entry_id ${row.sourceId} already exists from another import`,
      }));
  }

  private toSummary(
    batch: {
      id: string;
      kind: 'payments' | 'bank_entries';
      fileName: string;
      fileHashSha256: string;
      rowCount: number;
    },
    reused: boolean,
  ): ImportBatchSummary {
    return {
      batchId: batch.id,
      kind: batch.kind,
      status: 'published',
      fileName: batch.fileName,
      fileHashSha256: batch.fileHashSha256,
      rowCount: batch.rowCount,
      reused,
    };
  }
}
