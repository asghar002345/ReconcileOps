const MAX_CSV_BYTES = 5 * 1024 * 1024;

export type UploadValidationResult =
  | { ok: true }
  | { ok: false; message: string };

/** Client-side checks for CSV uploads. Server must still validate type and size. */
export function validateCsvFile(file: File | null): UploadValidationResult {
  if (!file) {
    return { ok: false, message: 'Choose a CSV file to upload.' };
  }
  if (file.size === 0) {
    return { ok: false, message: 'The selected file is empty.' };
  }
  if (file.size > MAX_CSV_BYTES) {
    return {
      ok: false,
      message: 'File is larger than 5 MB. Split the CSV or contact support.',
    };
  }
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  const looksCsv =
    name.endsWith('.csv') ||
    type === 'text/csv' ||
    type === 'application/vnd.ms-excel' ||
    type === 'application/csv' ||
    type === '';
  if (!looksCsv) {
    return { ok: false, message: 'Only CSV files are accepted.' };
  }
  return { ok: true };
}

export const MAX_CSV_BYTES_LABEL = '5 MB';
