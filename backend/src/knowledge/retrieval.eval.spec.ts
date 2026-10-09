import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { KnowledgeExplainService } from './knowledge-explain.service.js';
import { seedKnowledgeCorpus } from './seed-corpus.js';

type EvalQuestion = {
  id: string;
  question: string;
  expectedSection: string;
  documentTitle: string;
};

describe('retrieval eval (demo corpus)', () => {
  const prisma = new PrismaClient();
  let service: KnowledgeExplainService;
  let questions: EvalQuestion[];

  beforeAll(async () => {
    process.env.DATABASE_URL ??=
      'postgresql://reconcile:reconcile@127.0.0.1:5434/reconcileops';
    await seedKnowledgeCorpus(prisma);
    service = new KnowledgeExplainService(prisma);
    const evalPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../docs/knowledge/eval-questions.json',
    );
    questions = JSON.parse(readFileSync(evalPath, 'utf8')) as EvalQuestion[];
  });

  it('places the expected section in the top 5 for at least 70% of questions', async () => {
    let hits = 0;
    for (const question of questions) {
      const chunks = await service.retrieveChunks('ws_demo', question.question, 5);
      const hit = chunks.some(
        (chunk) =>
          chunk.section === question.expectedSection ||
          chunk.documentTitle === question.documentTitle,
      );
      if (hit) hits += 1;
    }
    const recall = hits / questions.length;
    expect(recall).toBeGreaterThanOrEqual(0.7);
  });
});
