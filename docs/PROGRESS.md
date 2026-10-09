# Progress

Learning notes include [performance-learning.md](performance-learning.md). Latest results: [perf-results.md](perf-results.md) (after `npm run perf:bench`).

## Active day

**Week 12** — deploy: Render (`render.yaml` API + worker + Postgres + Redis) and Vercel frontend. Guide: [DEPLOY.md](DEPLOY.md).

## Verified

- Perf indexes migration `20261008210000_perf_indexes`.
- `GET /payments` supports keyset cursors; offset mode unchanged for e2e.
- Scripts: `npm run perf:generate`, `npm run perf:bench`.
- Slow-request logging (≥200ms) via `TimingInterceptor`.

## How to run Week 11

```bash
cd backend
npx prisma migrate deploy
npm run perf:generate    # ~100k into ws_perf (takes a few minutes)
npm run perf:bench       # timings + EXPLAIN → docs/perf-results.md
```

## Deferred

- Week 12 AWS deploy, set-based SQL matcher, real APM metrics backend.

## Understanding question

Why can deep OFFSET pagination stay slow even after adding the right composite index?

## Next small task

Week 12 deployment / portfolio packaging.
