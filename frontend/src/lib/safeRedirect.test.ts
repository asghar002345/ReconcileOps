import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { safeInternalPath } from './safeRedirect.ts';

describe('safeInternalPath', () => {
  it('allows relative app paths', () => {
    assert.equal(safeInternalPath('/payments'), '/payments');
    assert.equal(
      safeInternalPath('/investigations/abc?x=1'),
      '/investigations/abc?x=1',
    );
  });

  it('rejects open-redirect shapes', () => {
    assert.equal(safeInternalPath('https://evil.example'), '/');
    assert.equal(safeInternalPath('//evil.example'), '/');
    assert.equal(safeInternalPath('\\evil'), '/');
    assert.equal(safeInternalPath('payments'), '/');
  });

  it('uses fallback for empty values', () => {
    assert.equal(safeInternalPath(null, '/login'), '/login');
    assert.equal(safeInternalPath('   ', '/overview'), '/overview');
  });
});
