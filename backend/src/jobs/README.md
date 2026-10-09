# Jobs module (Week 7)

Outbox + BullMQ for async reconciliation and CSV import.

- **API role:** enqueue operations, `GET /operations/:id`, retry failed jobs.
- **Worker role:** poll outbox → BullMQ → process jobs.

See `docs/jobs-learning.md`.
