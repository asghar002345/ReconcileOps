import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  clearAccessToken,
  readAccessToken,
  writeAccessToken,
} from './tokenStorage.ts';

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe('tokenStorage', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: createMemoryStorage(),
      configurable: true,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      value: createMemoryStorage(),
      configurable: true,
    });
  });

  it('writes and reads from sessionStorage', () => {
    writeAccessToken('tok-1');
    assert.equal(sessionStorage.getItem('reconcileops.accessToken'), 'tok-1');
    assert.equal(localStorage.getItem('reconcileops.accessToken'), null);
    assert.equal(readAccessToken(), 'tok-1');
  });

  it('migrates legacy localStorage tokens once', () => {
    localStorage.setItem('reconcileops.accessToken', 'legacy');
    assert.equal(readAccessToken(), 'legacy');
    assert.equal(sessionStorage.getItem('reconcileops.accessToken'), 'legacy');
    assert.equal(localStorage.getItem('reconcileops.accessToken'), null);
  });

  it('clears both storages on logout', () => {
    writeAccessToken('tok-2');
    localStorage.setItem('reconcileops.accessToken', 'stale');
    clearAccessToken();
    assert.equal(readAccessToken(), null);
  });
});
