import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import {
  DEMO_EMBEDDING_MODEL,
  PROMPT_VERSION,
  embedTextDemo,
  vectorToSqlLiteral,
} from './embeddings.js';

export type StructuredExplanation = {
  observedFacts: string[];
  possibleCauses: string[];
  missingEvidence: string[];
  nextSteps: string[];
  citations: Array<{
    chunkId: string;
    documentTitle: string;
    section: string;
    isDemoPolicy: boolean;
  }>;
  uncertainty: string;
  arithmetic: {
    expectedNetFils: string | null;
    actualSettledFils: string | null;
    differenceFils: string | null;
    differenceAgreesWithSql: true;
  };
};

export type ExplainResult = {
  id: string;
  investigationId: string;
  promptVersion: string;
  modelVersion: string;
  latencyMs: number;
  evidence: Record<string, unknown>;
  explanation: StructuredExplanation;
  createdAt: string;
};

type RetrievedChunk = {
  id: string;
  section: string;
  content: string;
  documentTitle: string;
  isDemoPolicy: boolean;
  distance: number;
};

@Injectable()
export class KnowledgeExplainService {
  constructor(private readonly prisma: PrismaService) {}

  async explain(
    workspaceId: string,
    investigationId: string,
    requestedByUserId: string,
  ): Promise<ExplainResult> {
    const started = Date.now();

    const investigation = await this.prisma.investigation.findFirst({
      where: { id: investigationId, workspaceId },
      include: { reconciliationResult: true },
    });
    if (!investigation) {
      throw new NotFoundException('Investigation not found');
    }

    const result = investigation.reconciliationResult;
    const evidence = this.buildEvidence(investigation.id, result);
    if (!evidence.differenceMatchesStored) {
      throw new BadRequestException(
        'Stored differenceFils does not match recomputed actual − expected',
      );
    }
    const query = [
      result.outcome,
      result.reason,
      'fee settlement shortfall investigation policy',
    ].join(' ');

    const chunks = await this.retrieveChunks(workspaceId, query, 5);
    const explanation = this.composeExplanation(evidence, chunks);

    const saved = await this.prisma.aiExplanation.create({
      data: {
        workspaceId,
        investigationId,
        requestedByUserId,
        promptVersion: PROMPT_VERSION,
        modelVersion: DEMO_EMBEDDING_MODEL,
        evidenceJson: evidence as Prisma.InputJsonValue,
        chunkIds: chunks.map((chunk) => chunk.id),
        explanationJson: explanation as unknown as Prisma.InputJsonValue,
        latencyMs: Date.now() - started,
      },
    });

    return {
      id: saved.id,
      investigationId,
      promptVersion: saved.promptVersion,
      modelVersion: saved.modelVersion,
      latencyMs: saved.latencyMs,
      evidence,
      explanation,
      createdAt: saved.createdAt.toISOString(),
    };
  }

  async listForInvestigation(workspaceId: string, investigationId: string) {
    const rows = await this.prisma.aiExplanation.findMany({
      where: { workspaceId, investigationId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return rows.map((row) => ({
      id: row.id,
      promptVersion: row.promptVersion,
      modelVersion: row.modelVersion,
      latencyMs: row.latencyMs,
      explanation: row.explanationJson,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async retrieveChunks(
    workspaceId: string,
    query: string,
    limit: number,
  ): Promise<RetrievedChunk[]> {
    const embedding = embedTextDemo(query);
    const literal = vectorToSqlLiteral(embedding);

    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        section: string;
        content: string;
        document_title: string;
        is_demo_policy: boolean;
        distance: number;
      }>
    >(
      `
      SELECT
        c.id,
        c.section,
        c.content,
        d.title AS document_title,
        d.is_demo_policy,
        (c.embedding <=> $1::vector) AS distance
      FROM document_chunks c
      INNER JOIN knowledge_documents d ON d.id = c.document_id
      WHERE c.workspace_id = $2
        AND c.embedding IS NOT NULL
      ORDER BY c.embedding <=> $1::vector
      LIMIT $3
      `,
      literal,
      workspaceId,
      limit,
    );

    return rows.map((row) => ({
      id: row.id,
      section: row.section,
      content: row.content,
      documentTitle: row.document_title,
      isDemoPolicy: row.is_demo_policy,
      distance: Number(row.distance),
    }));
  }

  private buildEvidence(
    investigationId: string,
    result: {
      id: string;
      outcome: string;
      referenceNormalized: string;
      expectedNetFils: bigint | null;
      actualSettledFils: bigint | null;
      differenceFils: bigint | null;
      reason: string;
      paymentIds: string[];
      bankEntryIds: string[];
    },
  ) {
    const expected = result.expectedNetFils;
    const actual = result.actualSettledFils;
    // Matcher stores actual − expected (shortfall is negative).
    const difference =
      expected !== null && actual !== null ? actual - expected : null;

    return {
      investigationId,
      resultId: result.id,
      outcome: result.outcome,
      referenceNormalized: result.referenceNormalized,
      reason: result.reason,
      paymentIds: result.paymentIds,
      bankEntryIds: result.bankEntryIds,
      expectedNetFils: expected?.toString() ?? null,
      actualSettledFils: actual?.toString() ?? null,
      differenceFilsStored: result.differenceFils?.toString() ?? null,
      differenceFilsComputed: difference?.toString() ?? null,
      // Gate: explanation arithmetic must match SQL-derived values.
      differenceMatchesStored:
        difference === null ||
        result.differenceFils === null ||
        difference === result.differenceFils,
    };
  }

  private composeExplanation(
    evidence: ReturnType<KnowledgeExplainService['buildEvidence']>,
    chunks: RetrievedChunk[],
  ): StructuredExplanation {
    const observedFacts = [
      `Outcome from reconciliation SQL: ${evidence.outcome}`,
      `Normalized reference: ${evidence.referenceNormalized}`,
      `Expected net (fils): ${evidence.expectedNetFils ?? 'n/a'}`,
      `Actual settled (fils): ${evidence.actualSettledFils ?? 'n/a'}`,
      `Difference (fils, recomputed): ${evidence.differenceFilsComputed ?? 'n/a'}`,
      `Matcher reason: ${evidence.reason}`,
    ];

    const possibleCauses: string[] = [];
    const missingEvidence: string[] = [];
    const nextSteps: string[] = [];

    if (evidence.outcome === 'AMOUNT_MISMATCH') {
      possibleCauses.push(
        'Additional acquiring fee or MDR adjustment after the recorded fee (see demo fee schedule).',
      );
      possibleCauses.push(
        'Bank settlement reflects a different commercial agreement than the payment fee field.',
      );
      missingEvidence.push(
        'Merchant fee invoice or acquiring statement line for this reference.',
      );
      nextSteps.push(
        'Confirm fee with finance; propose a resolution without rewriting payment/bank amounts.',
      );
    } else if (evidence.outcome === 'PAYMENT_WITHOUT_BANK_ENTRY') {
      possibleCauses.push('Settlement not yet exported in the bank CSV.');
      missingEvidence.push('Later bank statement covering the settlement window.');
      nextSteps.push('Request an updated bank export before write-off.');
    } else if (evidence.outcome === 'AMBIGUOUS') {
      possibleCauses.push('Repeated normalized reference on one or both sides.');
      nextSteps.push('Manually pair candidates; do not auto-pick the first row.');
    } else if (evidence.outcome === 'OUTSIDE_SETTLEMENT_WINDOW') {
      possibleCauses.push('Bank settled_at is outside the 3-day UTC window window.');
      nextSteps.push('Verify dates; escalate if a contractual exception applies.');
    } else {
      possibleCauses.push(
        'Insufficient policy overlap for a confident cause — treat as uncertain.',
      );
    }

    if (chunks.length === 0) {
      missingEvidence.push('No authorized policy chunks retrieved for this workspace.');
    }

    const uncertainty =
      chunks.length === 0
        ? 'Uncertain: no policy evidence retrieved; amounts above are still from SQL only.'
        : 'Causes are hypotheses grounded in demo policy excerpts; amounts are from SQL and were not estimated by the model.';

    return {
      observedFacts,
      possibleCauses,
      missingEvidence,
      nextSteps,
      citations: chunks.map((chunk) => ({
        chunkId: chunk.id,
        documentTitle: chunk.documentTitle,
        section: chunk.section,
        isDemoPolicy: chunk.isDemoPolicy,
      })),
      uncertainty,
      arithmetic: {
        expectedNetFils: evidence.expectedNetFils,
        actualSettledFils: evidence.actualSettledFils,
        differenceFils: evidence.differenceFilsComputed,
        differenceAgreesWithSql: true,
      },
    };
  }
}
