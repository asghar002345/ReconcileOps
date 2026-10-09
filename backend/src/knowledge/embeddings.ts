import { createHash } from 'node:crypto';

/** Demo embedding dimensionality stored in pgvector. */
export const EMBEDDING_DIMS = 64;

/** Deterministic local model — no external API required for tests/demo. */
export const DEMO_EMBEDDING_MODEL = 'demo-hash-v1';

export const PROMPT_VERSION = 'explain-discrepancy-v1';

/**
 * Build a unit-ish vector from text using overlapping sha256 slices.
 * Good enough for demo retrieval of short policy sections; replace with a
 * real embedding model when OPENAI_API_KEY (or similar) is wired.
 */
export function embedTextDemo(text: string): number[] {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  const vector = new Array<number>(EMBEDDING_DIMS).fill(0);
  if (!normalized) {
    return vector;
  }

  for (let i = 0; i < EMBEDDING_DIMS; i += 1) {
    const digest = createHash('sha256')
      .update(`${normalized}::${i}`)
      .digest();
    // Map two bytes to [-1, 1]
    const raw = (digest[0]! << 8) | digest[1]!;
    vector[i] = raw / 32767.5 - 1;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    return vector;
  }
  return vector.map((value) => value / norm);
}

export function vectorToSqlLiteral(values: number[]): string {
  return `[${values.map((value) => value.toFixed(8)).join(',')}]`;
}

export function splitMarkdownByHeading(markdown: string): Array<{
  section: string;
  content: string;
}> {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const chunks: Array<{ section: string; content: string }> = [];
  let section = 'Introduction';
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join('\n').trim();
    if (content) {
      chunks.push({ section, content });
    }
    buffer = [];
  };

  for (const line of lines) {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      section = heading[2]!.trim();
      continue;
    }
    buffer.push(line);
  }
  flush();
  return chunks;
}
