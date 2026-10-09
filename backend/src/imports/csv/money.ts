export type FilsParseResult =
  | { ok: true; fils: bigint }
  | { ok: false; message: string };

/**
 * Convert a non-negative decimal string with at most two places into fils.
 * "100.00" → 10000n, "94" → 9400n, "3.5" → 350n.
 */
export function decimalToFils(raw: string): FilsParseResult {
  const value = raw.trim();
  if (value === '') {
    return { ok: false, message: 'Amount is required' };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    return {
      ok: false,
      message:
        'Amount must be a non-negative decimal with at most two places',
    };
  }

  const [wholePart, fractionPart = ''] = value.split('.');
  const filsFraction = (fractionPart + '00').slice(0, 2);
  return {
    ok: true,
    fils: BigInt(wholePart) * 100n + BigInt(filsFraction),
  };
}

export function normalizeReference(value: string): string {
  return value.trim().toUpperCase();
}
