import type { ConnectionOptions } from 'bullmq';

/** Parse REDIS_URL for BullMQ / ioredis (supports redis:// and rediss://). */
export function redisConnectionFromUrl(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  const connection: ConnectionOptions = {
    host: url.hostname,
    port: Number(url.port || 6379),
    maxRetriesPerRequest: null,
  };

  if (url.username) {
    connection.username = decodeURIComponent(url.username);
  }
  if (url.password) {
    connection.password = decodeURIComponent(url.password);
  }
  if (url.protocol === 'rediss:') {
    connection.tls = {};
  }

  return connection;
}
