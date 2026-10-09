# Learning note: Simulated webhooks (Day 3 stretch → Week 8)

## What this module is for

Providers push **payment.captured** events into ReconcileOps. Delivery is unreliable: the same event may arrive many times, and two delivery IDs may describe one business operation.

## Week 8 flow (async)

1. API verifies HMAC + timestamp on **raw bytes**.
2. One PostgreSQL transaction writes:
   - `webhook_events` with status **`accepted`**
   - `async_operations` (`webhook_payment_captured`)
   - `outbox_events` (pending BullMQ dispatch)
3. API returns **200** immediately (`paymentId` may still be null).
4. Worker dispatches outbox → BullMQ → applies payment + audit, sets webhook status **`processed`**.

Postgres and Redis still do not share a transaction. If Redis is down, the outbox stays `pending` and recovers later.

## Supported event

| Field | Meaning |
|---|---|
| `type` | Only `payment.captured` |
| `eventId` | Delivery identity (unique per workspace + provider account) |
| `businessOperationId` | Domain operation identity (also unique) |
| `data.paymentId` | Provider payment source id |

Effect (in the worker): create a payment row if that source id is new. **Does not** invent a bank settlement.

## Security

1. Read **raw request bytes**.
2. Verify `X-ReconcileOps-Signature` = hex HMAC-SHA256 of `timestamp + "." + rawBody`.
3. Reject if `X-ReconcileOps-Timestamp` is outside ± tolerance.

No JWT on this route — the signature is the credential.

## Idempotency

| Replay | Result |
|---|---|
| Same `eventId` again | HTTP 200, `reused: true`, one payment after worker runs |
| New `eventId`, same `businessOperationId` | HTTP 200, `reusedOperation: true`, still one payment |
| Invalid signature / stale timestamp | HTTP 401, no DB write |

## API

`POST /webhooks/payments` — public (HMAC).

When `paymentId` is null, poll `GET /operations/:operationId` (authenticated) or wait for worker completion in demos.

## Understanding questions

1. Why acknowledge **before** the payment row exists?
2. Why put the webhook row and outbox row in the **same** Postgres transaction?
3. What recovers an `accepted` event if the worker crashes before `processed`?
