import { createHmac, timingSafeEqual } from 'node:crypto';

export function buildSignedPayload(timestamp: string, rawBody: Buffer): string {
  return `${timestamp}.${rawBody.toString('utf8')}`;
}

export function signWebhookPayload(
  secret: string,
  timestamp: string,
  rawBody: Buffer,
): string {
  return createHmac('sha256', secret)
    .update(buildSignedPayload(timestamp, rawBody), 'utf8')
    .digest('hex');
}

export function verifyWebhookSignature(
  secret: string,
  timestamp: string,
  rawBody: Buffer,
  providedHex: string,
): boolean {
  const expected = signWebhookPayload(secret, timestamp, rawBody);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(providedHex.trim().toLowerCase(), 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function isTimestampFresh(
  timestampSeconds: number,
  nowSeconds: number,
  toleranceSeconds: number,
): boolean {
  return Math.abs(nowSeconds - timestampSeconds) <= toleranceSeconds;
}
