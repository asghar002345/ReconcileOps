# Learning note: Knowledge / Explain discrepancy (Weeks 9–10)

## Separation of concerns

| Concern | Source of truth |
|---|---|
| Amounts, references, outcomes | PostgreSQL via fixed queries / Prisma |
| Fee & investigation **guidance** | Demo policy chunks in pgvector |
| Human approval | Investigations module (unchanged) |

The model (here: a **deterministic template composer** over SQL facts + retrieved chunks) **cannot** approve a case, rewrite fils amounts, or run arbitrary SQL.

## Week 9 — ingest

Demo policies live under `docs/knowledge/demo-policies/` and are labeled **DEMO POLICY — invented**.

1. Split markdown on `##` / `#` headings.
2. Embed with `demo-hash-v1` (64-d deterministic hash vectors — no API key required).
3. Store in `knowledge_documents` + `document_chunks.embedding` (`vector(64)`).
4. Re-ingest of unchanged `content_hash` is a no-op (no duplicate chunks).

Seed: `cd backend && npm run db:setup`  
Python exercise: `cd scripts/python && uv run python ingest_policies.py`

Eval questions: `docs/knowledge/eval-questions.json` (20 labeled questions).

## Week 10 — explain

`POST /investigations/:id/explain`

1. Load investigation + reconciliation result (workspace-scoped).
2. Recompute difference fils in code; require agreement with stored difference.
3. Embed a query from outcome + reason; retrieve top-5 chunks (`<=>` cosine distance).
4. Compose structured JSON: facts, possible causes, missing evidence, next steps, citations, uncertainty.
5. Persist `ai_explanations` (append-only history).

## API

| Method | Path |
|---|---|
| `POST` | `/investigations/:id/explain` |
| `GET` | `/investigations/:id/explanations` |

## Understanding questions

1. Why must shortfall fils come from SQL rather than the LLM?
2. Why label demo policies explicitly in citations?
3. What should happen if retrieval returns zero chunks?
