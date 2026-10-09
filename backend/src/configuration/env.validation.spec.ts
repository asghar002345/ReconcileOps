import { validateEnv } from './env.validation.js';

describe('validateEnv', () => {
  const valid = {
    DATABASE_URL:
      'postgresql://reconcile:reconcile@127.0.0.1:5434/reconcileops',
    PORT: '3000',
    JWT_SECRET: 'dev-only-change-me-reconcileops',
    JWT_EXPIRES_IN: '1h',
    WEBHOOK_HMAC_SECRET: 'dev-only-webhook-hmac-secret',
    WEBHOOK_TOLERANCE_SECONDS: '300',
    REDIS_URL: 'redis://127.0.0.1:6379',
  };

  it('returns validated configuration values', () => {
    expect(validateEnv(valid)).toEqual({
      PORT: 3000,
      DATABASE_URL: valid.DATABASE_URL,
      JWT_SECRET: valid.JWT_SECRET,
      JWT_EXPIRES_IN: '1h',
      WEBHOOK_HMAC_SECRET: valid.WEBHOOK_HMAC_SECRET,
      WEBHOOK_TOLERANCE_SECONDS: 300,
      REDIS_URL: valid.REDIS_URL,
      CORS_ORIGINS: [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3001',
        'http://127.0.0.1:3001',
      ],
    });
  });

  it('uses port 3000, 1h expiry, and 300s webhook tolerance when omitted', () => {
    const result = validateEnv({
      DATABASE_URL: valid.DATABASE_URL,
      JWT_SECRET: valid.JWT_SECRET,
      WEBHOOK_HMAC_SECRET: valid.WEBHOOK_HMAC_SECRET,
    });
    expect(result.PORT).toBe(3000);
    expect(result.JWT_EXPIRES_IN).toBe('1h');
    expect(result.WEBHOOK_TOLERANCE_SECONDS).toBe(300);
    expect(result.REDIS_URL).toBe('redis://127.0.0.1:6379');
  });

  it('accepts rediss:// and merges CORS_ORIGINS', () => {
    const result = validateEnv({
      ...valid,
      REDIS_URL: 'rediss://:secret@example.render.com:6379',
      CORS_ORIGINS: 'https://reconcileops.vercel.app',
    });
    expect(result.REDIS_URL).toBe('rediss://:secret@example.render.com:6379');
    expect(result.CORS_ORIGINS).toContain('https://reconcileops.vercel.app');
    expect(result.CORS_ORIGINS).toContain('http://localhost:5173');
  });

  it('throws a useful error when DATABASE_URL is missing', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL is required/);
  });

  it('throws when DATABASE_URL is not a PostgreSQL URL', () => {
    expect(() =>
      validateEnv({ DATABASE_URL: 'mysql://localhost/reconcileops' }),
    ).toThrow(/postgresql:\/\//);
  });

  it('throws when PORT is not a usable integer', () => {
    expect(() => validateEnv({ ...valid, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('throws when JWT_SECRET is too short', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'short' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('throws when WEBHOOK_HMAC_SECRET is too short', () => {
    expect(() =>
      validateEnv({ ...valid, WEBHOOK_HMAC_SECRET: 'short' }),
    ).toThrow(/WEBHOOK_HMAC_SECRET/);
  });
});
