import { parse } from 'csv-parse/sync';
import type { ImportRowError } from './contracts.js';

export type ParsedCsv = {
  headers: string[];
  records: Record<string, string>[];
};

export function parseCsvBuffer(buffer: Buffer): ParsedCsv {
  const records = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: false,
    bom: true,
  }) as Record<string, string>[];

  const headers =
    records.length > 0
      ? Object.keys(records[0]!)
      : (parse(buffer, {
          columns: false,
          to_line: 1,
          relax_column_count: true,
          bom: true,
        }) as string[][])[0]?.map((h) => h.trim()) ?? [];

  return { headers, records };
}

export function assertHeaders(
  actual: string[],
  expected: readonly string[],
): ImportRowError | null {
  const missing = expected.filter((h) => !actual.includes(h));
  const extra = actual.filter((h) => !expected.includes(h));
  if (missing.length === 0 && extra.length === 0) {
    return null;
  }
  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`missing columns: ${missing.join(', ')}`);
  }
  if (extra.length > 0) {
    parts.push(`unexpected columns: ${extra.join(', ')}`);
  }
  return {
    rowNumber: 0,
    field: 'headers',
    message: parts.join('; '),
  };
}
