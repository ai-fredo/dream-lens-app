// apps/api/src/services/embeddings.ts
import type OpenAI from 'openai';
import { DreamLensError } from '@dreamlens/shared/types/errors';

const EMBEDDING_MODEL = 'text-embedding-3-small'; // 1536 dimensions

export interface EmbeddingsService {
  embed(text: string): Promise<number[]>;
}

/**
 * Wraps an injected OpenAI client so callers (and tests) can supply a fake
 * with the same shape, following the `makeX(injectedClient)` factory pattern
 * used elsewhere (see middleware/auth.ts, routes/dreams.ts).
 */
export function makeEmbeddings(openai: OpenAI): EmbeddingsService {
  return {
    async embed(text: string): Promise<number[]> {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
      });
      const first = response.data[0];
      if (!first) {
        throw new DreamLensError('EMBED_FAILED', 'OpenAI returned no embedding data');
      }
      return first.embedding;
    },
  };
}
