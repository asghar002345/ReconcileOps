import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const vercelPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../vercel.json',
);

describe('vercel connect-src', () => {
  it('lists exact API origins and no platform wildcards', () => {
    const config = JSON.parse(readFileSync(vercelPath, 'utf8')) as {
      headers: Array<{ headers: Array<{ key: string; value: string }> }>;
    };
    const csp = config.headers
      .flatMap((group) => group.headers)
      .find((header) => header.key === 'Content-Security-Policy');
    assert.ok(csp, 'Content-Security-Policy header');
    const match = /connect-src ([^;]+)/.exec(csp.value);
    assert.ok(match, 'connect-src directive');
    const tokens = match[1]?.split(/\s+/) ?? [];
    assert.deepEqual(tokens, [
      "'self'",
      'https://reconcileops-production.up.railway.app',
      'https://reconcileops-api.onrender.com',
      'http://127.0.0.1:3000',
      'http://localhost:3000',
    ]);
  });
});
