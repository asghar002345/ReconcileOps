# Deploy ReconcileOps (Render API + Vercel frontend)

| Piece | Host | Source |
|---|---|---|
| Nest API + worker | [Render](https://dashboard.render.com/) | `render.yaml` |
| Postgres + Key Value | Render | Blueprint |
| React (Vite) | [Vercel](https://vercel.com/) | `frontend/` |

You need a **GitHub (or GitLab/Bitbucket) repo** connected to both products. This folder is not a git remote yet until you push it.

## 0. Push the repo

```bash
cd /Users/metamelon/Documents/ReconcileOps
git init
git add .
git commit -m "Deploy-ready: Render blueprint + Vercel frontend"
gh auth login   # if needed
gh repo create ReconcileOps --private --source=. --remote=origin --push
```

## 1. Backend on Render

1. Open [https://dashboard.render.com/](https://dashboard.render.com/).
2. **New → Blueprint**.
3. Connect the `ReconcileOps` repo; Render reads `render.yaml`.
4. When prompted for `CORS_ORIGINS`, enter a placeholder such as `https://placeholder.vercel.app` (you will replace it after Vercel deploy).
5. Apply the Blueprint. Wait until **reconcileops-api** is Live.
6. Copy the API URL, e.g. `https://reconcileops-api.onrender.com`.
7. Confirm health: open `https://<api-host>/health` — expect JSON with DB ok.
8. Confirm docs: `https://<api-host>/docs`.

### What the Blueprint creates

- **reconcileops-db** — Postgres 16  
- **reconcileops-redis** — Key Value (Valkey), used by BullMQ  
- **reconcileops-api** — `npm run render:build` / `npm run render:start` (migrate + seed + API)  
- **reconcileops-worker** — `npm run render:worker` (outbox + jobs)

Free web services **spin down** after idle; the first request after sleep can take ~30–60s.

### pgvector note

Week 9–10 RAG needs `CREATE EXTENSION vector`. If migrate fails on Render Postgres with “extension vector is not available”:

1. Create a free [Neon](https://neon.tech/) project (pgvector enabled).
2. In Render → **reconcileops-api** and **reconcileops-worker** → Environment, set `DATABASE_URL` to the Neon connection string (SSL).
3. Redeploy both services.

### Seeded demo login

After `render:start` seed runs, use the same demo users as local (see seed / PROGRESS). Change passwords before sharing a public URL.

## 2. Frontend on Vercel

1. Open [https://vercel.com/new](https://vercel.com/new).
2. Import the same Git repo.
3. Configure:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite (or leave auto)
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Environment variable:
   - `VITE_API_URL` = `https://<your-render-api-host>` (no trailing slash)
5. Deploy. Copy the Vercel URL, e.g. `https://reconcileops.vercel.app`.

`frontend/vercel.json` rewrites SPA routes to `index.html`.

## 3. Wire CORS

On Render → **reconcileops-api** → Environment:

```text
CORS_ORIGINS=https://your-app.vercel.app
```

Redeploy the API (or wait for auto-redeploy). Then open the Vercel site, log in, and hit payments / import.

## 4. Manual Render setup (without Blueprint)

If you prefer the dashboard click-path:

1. **New → PostgreSQL** (free), note Internal Database URL.  
2. **New → Key Value** (free), note Internal Redis URL.  
3. **New → Web Service** → connect repo:
   - Root Directory: `backend`
   - Build: `npm ci && npm run render:build`
   - Start: `npm run render:start`
   - Env: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` (≥16 chars), `WEBHOOK_HMAC_SECRET` (≥16 chars), `JWT_EXPIRES_IN=1h`, `WEBHOOK_TOLERANCE_SECONDS=300`, `CORS_ORIGINS`, `NODE_VERSION=22.12.0`
4. **New → Background Worker** — same root/build, start `npm run render:worker`, same env (share JWT secrets with the API).

## Checklist

- [ ] `/health` on Render returns ok  
- [ ] Worker service is running (async import / reconcile complete)  
- [ ] Vercel build has `VITE_API_URL` pointing at Render  
- [ ] `CORS_ORIGINS` includes the Vercel origin  
- [ ] Login works from the Vercel URL  
