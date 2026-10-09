import { describe, expect, it } from 'vitest';
import {
  DEMO_EMBEDDING_MODEL,
  EMBEDDING_DIMS,
  embedTextDemo,
  splitMarkdownByHeading,
  vectorToSqlLiteral,
} from './embeddings.js';

describe('embeddings', () => {
  it('produces a fixed-length normalized demo vector', () => {
    const vector = embedTextDemo('Settlement window three calendar days');
    expect(vector).toHaveLength(EMBEDDING_DIMS);
    const norm = Math.sqrt(
      vector.reduce((sum, value) => sum + value * value, 0),
    );
    expect(norm).toBeCloseTo(1, 5);
    expect(DEMO_EMBEDDING_MODEL).toBe('demo-hash-v1');
  });

  it('is deterministic for the same text', () => {
    expect(embedTextDemo('fee shortfall')).toEqual(embedTextDemo('fee shortfall'));
  });

  it('splits markdown on headings', () => {
    const chunks = splitMarkdownByHeading(
      '# Title\n\nIntro\n\n## Fees\n\nThree dirhams.\n',
    );
    expect(chunks.map((chunk) => chunk.section)).toEqual(['Title', 'Fees']);
    expect(chunks[1]?.content).toContain('Three dirhams');
  });

  it('formats vectors for pgvector literals', () => {
    expect(vectorToSqlLiteral([0.1, -0.2])).toBe('[0.10000000,-0.20000000]');
  });
});
