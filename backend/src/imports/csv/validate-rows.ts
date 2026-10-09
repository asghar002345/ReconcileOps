import {
  type ImportRowError,
  type ValidatedBankRow,
  type ValidatedPaymentRow,
} from './contracts.js';
import { decimalToFils, normalizeReference } from './money.js';

function requireNonEmpty(
  rowNumber: number,
  field: string,
  value: string | undefined,
  errors: ImportRowError[],
): string | null {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') {
    errors.push({ rowNumber, field, message: `${field} is required` });
    return null;
  }
  return trimmed;
}

export function validatePaymentRecords(
  records: Record<string, string>[],
): { rows: ValidatedPaymentRow[]; errors: ImportRowError[] } {
  const errors: ImportRowError[] = [];
  const rows: ValidatedPaymentRow[] = [];
  const seenSourceIds = new Set<string>();

  records.forEach((record, index) => {
    const rowNumber = index + 1;
    const sourcePaymentId = requireNonEmpty(
      rowNumber,
      'payment_id',
      record.payment_id,
      errors,
    );
    const reference = requireNonEmpty(
      rowNumber,
      'reference',
      record.reference,
      errors,
    );
    const currency = requireNonEmpty(
      rowNumber,
      'currency',
      record.currency,
      errors,
    );
    const paidAtRaw = requireNonEmpty(
      rowNumber,
      'paid_at',
      record.paid_at,
      errors,
    );

    const gross = decimalToFils(record.gross_amount ?? '');
    if (!gross.ok) {
      errors.push({ rowNumber, field: 'gross_amount', message: gross.message });
    }
    const fee = decimalToFils(record.fee_amount ?? '');
    if (!fee.ok) {
      errors.push({ rowNumber, field: 'fee_amount', message: fee.message });
    }

    if (gross.ok && fee.ok && fee.fils > gross.fils) {
      errors.push({
        rowNumber,
        field: 'fee_amount',
        message: 'fee_amount cannot exceed gross_amount',
      });
    }

    if (currency !== null && currency !== 'AED') {
      errors.push({
        rowNumber,
        field: 'currency',
        message: 'Only AED is supported',
      });
    }

    let paidAt: Date | null = null;
    if (paidAtRaw !== null) {
      paidAt = new Date(paidAtRaw);
      if (Number.isNaN(paidAt.getTime())) {
        errors.push({
          rowNumber,
          field: 'paid_at',
          message: 'paid_at must be a valid UTC timestamp',
        });
        paidAt = null;
      }
    }

    if (sourcePaymentId !== null) {
      if (seenSourceIds.has(sourcePaymentId)) {
        errors.push({
          rowNumber,
          field: 'payment_id',
          message: 'Duplicate payment_id inside this file',
        });
      }
      seenSourceIds.add(sourcePaymentId);
    }

    if (
      sourcePaymentId !== null &&
      reference !== null &&
      currency === 'AED' &&
      gross.ok &&
      fee.ok &&
      fee.fils <= gross.fils &&
      paidAt !== null
    ) {
      rows.push({
        rowNumber,
        sourcePaymentId,
        referenceOriginal: reference,
        referenceNormalized: normalizeReference(reference),
        grossAmountFils: gross.fils,
        feeAmountFils: fee.fils,
        currency: 'AED',
        paidAt,
        rawPayload: { ...record },
      });
    }
  });

  return { rows, errors };
}

export function validateBankRecords(
  records: Record<string, string>[],
): { rows: ValidatedBankRow[]; errors: ImportRowError[] } {
  const errors: ImportRowError[] = [];
  const rows: ValidatedBankRow[] = [];
  const seenSourceIds = new Set<string>();

  records.forEach((record, index) => {
    const rowNumber = index + 1;
    const sourceBankEntryId = requireNonEmpty(
      rowNumber,
      'bank_entry_id',
      record.bank_entry_id,
      errors,
    );
    const reference = requireNonEmpty(
      rowNumber,
      'reference',
      record.reference,
      errors,
    );
    const currency = requireNonEmpty(
      rowNumber,
      'currency',
      record.currency,
      errors,
    );
    const settledAtRaw = requireNonEmpty(
      rowNumber,
      'settled_at',
      record.settled_at,
      errors,
    );

    const settled = decimalToFils(record.settled_amount ?? '');
    if (!settled.ok) {
      errors.push({
        rowNumber,
        field: 'settled_amount',
        message: settled.message,
      });
    }

    if (currency !== null && currency !== 'AED') {
      errors.push({
        rowNumber,
        field: 'currency',
        message: 'Only AED is supported',
      });
    }

    let settledAt: Date | null = null;
    if (settledAtRaw !== null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(settledAtRaw)) {
        errors.push({
          rowNumber,
          field: 'settled_at',
          message: 'settled_at must be YYYY-MM-DD',
        });
      } else {
        settledAt = new Date(`${settledAtRaw}T00:00:00.000Z`);
        if (Number.isNaN(settledAt.getTime())) {
          errors.push({
            rowNumber,
            field: 'settled_at',
            message: 'settled_at must be a valid date',
          });
          settledAt = null;
        }
      }
    }

    if (sourceBankEntryId !== null) {
      if (seenSourceIds.has(sourceBankEntryId)) {
        errors.push({
          rowNumber,
          field: 'bank_entry_id',
          message: 'Duplicate bank_entry_id inside this file',
        });
      }
      seenSourceIds.add(sourceBankEntryId);
    }

    if (
      sourceBankEntryId !== null &&
      reference !== null &&
      currency === 'AED' &&
      settled.ok &&
      settledAt !== null
    ) {
      rows.push({
        rowNumber,
        sourceBankEntryId,
        referenceOriginal: reference,
        referenceNormalized: normalizeReference(reference),
        settledAmountFils: settled.fils,
        currency: 'AED',
        settledAt,
        rawPayload: { ...record },
      });
    }
  });

  return { rows, errors };
}
