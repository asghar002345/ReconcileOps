# Webhooks module

Simulated provider webhook ingest for `payment.captured`.

## Flow

1. Verify `X-ReconcileOps-Timestamp` freshness (± tolerance).
2. Verify `X-ReconcileOps-Signature` = HMAC-SHA256(secret, `timestamp.rawBody`).
3. In one transaction: create payment (if new source id) + webhook_events row + audit.

## Idempotency

- Same `eventId` → reuse acknowledgment
- Same `businessOperationId` with a new `eventId` → reuse operation acknowledgment

See `docs/webhooks-learning.md`.
