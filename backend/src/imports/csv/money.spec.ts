import { describe, expect, it } from 'vitest';
import { decimalToFils, normalizeReference } from './money.js';

describe('decimalToFils', () => {
  it('converts two-decimal AED strings to fils', () => {
    expect(decimalToFils('100.00')).toEqual({ ok: true, fils: 10000n });
    expect(decimalToFils('94.00')).toEqual({ ok: true, fils: 9400n });
    expect(decimalToFils('3')).toEqual({ ok: true, fils: 300n });
    expect(decimalToFils('3.5')).toEqual({ ok: true, fils: 350n });
  });

  it('rejects more than two decimal places', () => {
    expect(decimalToFils('100.999')).toEqual({
      ok: false,
      message: expect.stringMatching(/two places/) as unknown as string,
    });
    expect(decimalToFils('100.999').ok).toBe(false);
  });

  it('rejects blank and non-decimal values', () => {
    expect(decimalToFils('').ok).toBe(false);
    expect(decimalToFils('abc').ok).toBe(false);
    expect(decimalToFils('-1.00').ok).toBe(false);
  });
});

describe('normalizeReference', () => {
  it('trims and uppercases', () => {
    expect(normalizeReference('  ref-100 ')).toBe('REF-100');
  });
});
