export type AppEnv = {
  PORT: number;
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  WEBHOOK_HMAC_SECRET: string;
  WEBHOOK_TOLERANCE_SECONDS: number;
  REDIS_URL: string;
  /** Extra browser origins allowed by CORS (Vercel URL, custom domain). */
  CORS_ORIGINS: string[];
};

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];

function parseCorsOrigins(raw: unknown): string[] {
  if (raw === undefined || raw === null || raw === '') {
    return [...DEFAULT_CORS_ORIGINS];
  }
  if (typeof raw !== 'string') {
    throw new Error(
      'CORS_ORIGINS must be a comma-separated list of origins, e.g. https://app.vercel.app',
    );
  }
  const extras = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  for (const origin of extras) {
    if (!origin.startsWith('http://') && !origin.startsWith('https://')) {
      throw new Error(
        `CORS_ORIGINS entry must start with http:// or https:// (got: ${origin})`,
      );
    }
  }
  return [...new Set([...DEFAULT_CORS_ORIGINS, ...extras])];
}

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const databaseUrl = config.DATABASE_URL;
  if (typeof databaseUrl !== 'string' || databaseUrl.trim() === '') {
    throw new Error(
      'DATABASE_URL is required. Copy backend/.env.example to backend/.env and set a PostgreSQL connection URL.',
    );
  }
  if (
    !databaseUrl.startsWith('postgresql://') &&
    !databaseUrl.startsWith('postgres://')
  ) {
    throw new Error(
      'DATABASE_URL must start with postgresql:// or postgres://.',
    );
  }

  const portValue = config.PORT ?? '3000';
  if (typeof portValue !== 'string' && typeof portValue !== 'number') {
    throw new Error('PORT must be an integer from 1 to 65535.');
  }
  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535.');
  }

  const jwtSecret = config.JWT_SECRET;
  if (typeof jwtSecret !== 'string' || jwtSecret.trim().length < 16) {
    throw new Error(
      'JWT_SECRET is required and must be at least 16 characters.',
    );
  }

  const jwtExpiresIn = config.JWT_EXPIRES_IN ?? '1h';
  if (typeof jwtExpiresIn !== 'string' || jwtExpiresIn.trim() === '') {
    throw new Error('JWT_EXPIRES_IN must be a non-empty duration string such as 1h.');
  }

  const webhookSecret = config.WEBHOOK_HMAC_SECRET;
  if (typeof webhookSecret !== 'string' || webhookSecret.trim().length < 16) {
    throw new Error(
      'WEBHOOK_HMAC_SECRET is required and must be at least 16 characters.',
    );
  }

  const toleranceRaw = config.WEBHOOK_TOLERANCE_SECONDS ?? '300';
  if (typeof toleranceRaw !== 'string' && typeof toleranceRaw !== 'number') {
    throw new Error('WEBHOOK_TOLERANCE_SECONDS must be a positive integer.');
  }
  const toleranceSeconds = Number(toleranceRaw);
  if (
    !Number.isInteger(toleranceSeconds) ||
    toleranceSeconds < 30 ||
    toleranceSeconds > 3600
  ) {
    throw new Error(
      'WEBHOOK_TOLERANCE_SECONDS must be an integer from 30 to 3600.',
    );
  }

  const redisUrl = config.REDIS_URL ?? 'redis://127.0.0.1:6379';
  if (
    typeof redisUrl !== 'string' ||
    (!redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://'))
  ) {
    throw new Error('REDIS_URL must start with redis:// or rediss://');
  }

  return {
    PORT: port,
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: jwtExpiresIn,
    WEBHOOK_HMAC_SECRET: webhookSecret,
    WEBHOOK_TOLERANCE_SECONDS: toleranceSeconds,
    REDIS_URL: redisUrl,
    CORS_ORIGINS: parseCorsOrigins(config.CORS_ORIGINS),
  };
}
