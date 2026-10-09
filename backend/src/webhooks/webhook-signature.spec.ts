import { describe, expect, it } from 'vitest';
import {
  isTimestampFresh,
  signWebhookPayload,
  verifyWebhookSignature,
} from './webhook-signature.js';

describe('webhook-signature', () => {
  const secret = 'dev-only-webhook-hmac-secret';
  const timestamp = '1696780800';
  const rawBody = Buffer.from('{"eventId":"evt_1"}', 'utf8');

  it('verifies a correct HMAC over timestamp.rawBody', () => {
    const signature = signWebhookPayload(secret, timestamp, rawBody);
    expect(verifyWebhookSignature(secret, timestamp, rawBody, signature)).toBe(
      true,
    );
  });

  it('rejects a tampered body', () => {
    const signature = signWebhookPayload(secret, timestamp, rawBody);
    expect(
      verifyWebhookSignature(
        secret,
        timestamp,
        Buffer.from('{"eventId":"evt_2"}', 'utf8'),
        signature,
      ),
    ).toBe(false);
  });

  it('accepts timestamps inside the tolerance window', () => {
    expect(isTimestampFresh(1000, 1100, 300)).toBe(true);
    expect(isTimestampFresh(1000, 1400, 300)).toBe(false);
  });
});
