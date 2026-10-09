import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatAed } from './format.ts';

describe('formatAed', () => {
  it('formats fils as AED decimals', () => {
    assert.equal(formatAed('9700'), '97.00');
    assert.equal(formatAed('-150'), '-1.50');
  });

  it('returns em dash for missing values', () => {
    assert.equal(formatAed(null), '—');
    assert.equal(formatAed(''), '—');
  });
});
