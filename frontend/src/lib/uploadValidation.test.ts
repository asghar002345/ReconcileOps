import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateCsvFile } from './uploadValidation.ts';

describe('validateCsvFile', () => {
  it('rejects missing or empty files', () => {
    assert.equal(validateCsvFile(null).ok, false);
    assert.equal(validateCsvFile(new File([], 'empty.csv')).ok, false);
  });

  it('accepts csv by extension', () => {
    const file = new File(['a,b\n1,2\n'], 'payments.csv', { type: 'text/csv' });
    assert.deepEqual(validateCsvFile(file), { ok: true });
  });

  it('rejects oversized files', () => {
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.csv', {
      type: 'text/csv',
    });
    assert.equal(validateCsvFile(big).ok, false);
  });

  it('rejects non-csv names', () => {
    const file = new File(['{}'], 'data.json', { type: 'application/json' });
    assert.equal(validateCsvFile(file).ok, false);
  });
});
