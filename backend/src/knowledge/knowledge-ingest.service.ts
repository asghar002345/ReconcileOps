import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaService } from '../database/prisma.service.js';
import { PROVIDER_ACCOUNT_ID } from '../imports/csv/contracts.js';
import {
  DEMO_EMBEDDING_MODEL,
  embedTextDemo,
  splitMarkdownByHeading,
  vectorToSqlLiteral,
} from './embeddings.js';

export type IngestDocumentInput = {
  workspaceId: string;
  title: string;
  version: string;
  sourceUrl?: string;
  effectiveDate: string;
  markdown: string;
  isDemoPolicy?: boolean;
};

@Injectable()
export class KnowledgeIngestService {
  constructor(private readonly prisma: PrismaService) {}

  async ingestMarkdown(input: IngestDocumentInput): Promise<{
    documentId: string;
    chunkCount: number;
    reused: boolean;
  }> {
    const contentHash = createHash('sha256')
      .update(input.markdown)
      .digest('hex');

    const existing = await this.prisma.knowledgeDocument.findUnique({
      where: {
        workspaceId_providerAccountId_title_version: {
          workspaceId: input.workspaceId,
          providerAccountId: PROVIDER_ACCOUNT_ID,
          title: input.title,
          version: input.version,
        },
      },
      include: { _count: { select: { chunks: true } } },
    });

    if (existing && existing.contentHash === contentHash) {
      return {
        documentId: existing.id,
        chunkCount: existing._count.chunks,
        reused: true,
      };
    }

    if (existing) {
      await this.prisma.knowledgeDocument.delete({ where: { id: existing.id } });
    }

    const document = await this.prisma.knowledgeDocument.create({
      data: {
        workspaceId: input.workspaceId,
        providerAccountId: PROVIDER_ACCOUNT_ID,
        title: input.title,
        version: input.version,
        sourceUrl: input.sourceUrl ?? null,
        effectiveDate: new Date(input.effectiveDate),
        contentHash,
        isDemoPolicy: input.isDemoPolicy ?? true,
      },
    });

    const sections = splitMarkdownByHeading(input.markdown);
    let chunkCount = 0;

    for (const section of sections) {
      const sectionHash = createHash('sha256')
        .update(`${section.section}\n${section.content}`)
        .digest('hex');
      const embedding = embedTextDemo(`${section.section}\n${section.content}`);
      const chunk = await this.prisma.documentChunk.create({
        data: {
          documentId: document.id,
          workspaceId: input.workspaceId,
          section: section.section.slice(0, 255),
          content: section.content,
          contentHash: sectionHash,
          embeddingModel: DEMO_EMBEDDING_MODEL,
        },
      });

      // Vector literal is built only from our numeric embedding (not user SQL).
      await this.prisma.$executeRawUnsafe(
        `UPDATE document_chunks SET embedding = '${vectorToSqlLiteral(embedding)}'::vector WHERE id = $1`,
        chunk.id,
      );
      chunkCount += 1;
    }

    return { documentId: document.id, chunkCount, reused: false };
  }

  async ingestDemoCorpus(workspaceId: string): Promise<number> {
    const root = path.resolve(process.cwd(), '..', 'docs', 'knowledge', 'demo-policies');
    const files = [
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
    ];

    let total = 0;
    for (const item of files) {
      const markdown = await readFile(path.join(root, item.file), 'utf8');
      const result = await this.ingestMarkdown({
        workspaceId,
        title: item.title,
        version: item.version,
        sourceUrl: `demo://policies/${item.file}`,
        effectiveDate: item.effectiveDate,
        markdown,
        isDemoPolicy: true,
      });
      total += result.chunkCount;
    }
    return total;
  }
}
