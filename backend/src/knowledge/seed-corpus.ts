import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '@prisma/client';
import { PROVIDER_ACCOUNT_ID } from '../imports/csv/contracts.js';
import {
  DEMO_EMBEDDING_MODEL,
  embedTextDemo,
  splitMarkdownByHeading,
  vectorToSqlLiteral,
} from './embeddings.js';

const WORKSPACE_ID = 'ws_demo';

const DEMO_FILES = [
  {
    file: 'paydemo-fees-v1.md',
    title: 'PayDemo fee schedule',
    version: 'v1',
    effectiveDate: '2026-10-01',
  },
  {
    file: 'paydemo-investigations-v1.md',
    title: 'PayDemo investigation guidance',
    version: 'v1',
    effectiveDate: '2026-10-01',
  },
] as const;

function demoPoliciesDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../../../docs/knowledge/demo-policies');
}

export async function seedKnowledgeCorpus(
  prisma: PrismaClient,
): Promise<number> {
  const root = demoPoliciesDir();
  let chunks = 0;

  for (const item of DEMO_FILES) {
    const markdown = await readFile(path.join(root, item.file), 'utf8');
    const contentHash = createHash('sha256').update(markdown).digest('hex');

    const existing = await prisma.knowledgeDocument.findUnique({
      where: {
        workspaceId_providerAccountId_title_version: {
          workspaceId: WORKSPACE_ID,
          providerAccountId: PROVIDER_ACCOUNT_ID,
          title: item.title,
          version: item.version,
        },
      },
    });

    if (existing?.contentHash === contentHash) {
      const count = await prisma.documentChunk.count({
        where: { documentId: existing.id },
      });
      chunks += count;
      continue;
    }

    if (existing) {
      await prisma.knowledgeDocument.delete({ where: { id: existing.id } });
    }

    const document = await prisma.knowledgeDocument.create({
      data: {
        workspaceId: WORKSPACE_ID,
        providerAccountId: PROVIDER_ACCOUNT_ID,
        title: item.title,
        version: item.version,
        sourceUrl: `demo://policies/${item.file}`,
        effectiveDate: new Date(item.effectiveDate),
        contentHash,
        isDemoPolicy: true,
      },
    });

    for (const section of splitMarkdownByHeading(markdown)) {
      const sectionHash = createHash('sha256')
        .update(`${section.section}\n${section.content}`)
        .digest('hex');
      const embedding = embedTextDemo(`${section.section}\n${section.content}`);
      const chunk = await prisma.documentChunk.create({
        data: {
          documentId: document.id,
          workspaceId: WORKSPACE_ID,
          section: section.section.slice(0, 255),
          content: section.content,
          contentHash: sectionHash,
          embeddingModel: DEMO_EMBEDDING_MODEL,
        },
      });
      await prisma.$executeRawUnsafe(
        `UPDATE document_chunks SET embedding = '${vectorToSqlLiteral(embedding)}'::vector WHERE id = $1`,
        chunk.id,
      );
      chunks += 1;
    }
  }

  return chunks;
}
