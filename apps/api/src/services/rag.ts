// apps/api/src/services/rag.ts
//
// Builds the retrieval-augmented context (symbol matches + user pattern
// history) passed to Claude for dream interpretation. Implements
// engineering-standards §7 Steps 1-4 (embed -> vector search -> pattern
// summary -> format context strings), with degraded-mode fallback per §5:
// if embedding fails, RAG is skipped entirely (no throw) and the caller
// still gets a usable (empty) context.
import type OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserId } from '@dreamlens/shared/types/domain';
import { makeEmbeddings } from './embeddings';

const MATCH_COUNT = 15;
const MATCH_THRESHOLD = 0.7;
const TOP_RECURRING_SYMBOLS = 5;

interface MatchedSymbol {
  symbol: string;
  interpretation: string;
  category: string;
}

interface UserPatternRow {
  symbol: string;
  occurrence_count: number;
}

export interface RagContext {
  symbolContext: string;
  patternContext: string;
  embedding: number[] | null;
}

export interface RagService {
  buildContext(userId: UserId, transcript: string): Promise<RagContext>;
}

/** Formats matched dream symbols into the block Claude's system prompt expects (§7 Step 4). */
function formatSymbolContext(symbols: MatchedSymbol[]): string {
  if (symbols.length === 0) return '';
  return symbols
    .map((s) => `SYMBOL: ${s.symbol}\nINTERPRETATION: ${s.interpretation}\nCATEGORY: ${s.category}`)
    .join('\n\n');
}

/** Formats the user's recurring-symbol history into the block Claude's system prompt expects (§7 Step 4). */
function formatPatternContext(patterns: UserPatternRow[]): string {
  if (patterns.length === 0) return "This is the user's first dream entry.";
  const recurringSymbols = patterns
    .slice(0, TOP_RECURRING_SYMBOLS)
    .map((p) => `${p.symbol} (${p.occurrence_count}x)`)
    .join(', ');
  return `USER DREAM HISTORY:\nRecurring symbols: ${recurringSymbols}`;
}

/**
 * Wraps injected Supabase + OpenAI clients so callers (and tests) can supply
 * fakes with the same shape, following the `makeX(injectedClient)` factory
 * pattern used elsewhere (see middleware/auth.ts, routes/dreams.ts).
 */
export function makeRag(db: SupabaseClient, openai: OpenAI): RagService {
  const embeddings = makeEmbeddings(openai);

  return {
    async buildContext(userId: UserId, transcript: string): Promise<RagContext> {
      // Step 1 — Embed transcript (with fallback). On failure, skip RAG
      // entirely (degraded mode): no throw, empty symbol context, null embedding.
      // Never log transcript content — only the fact that embedding failed.
      let embedding: number[] | null;
      try {
        embedding = await embeddings.embed(transcript);
      } catch {
        return { embedding: null, symbolContext: '', patternContext: '' };
      }

      // Step 2 — Vector search (skip if Step 1 failed, but we already returned above).
      const { data: symbolRows } = await db.rpc('match_dream_symbols', {
        query_embedding: embedding,
        match_count: MATCH_COUNT,
        match_threshold: MATCH_THRESHOLD,
      });
      const symbols = (symbolRows ?? []) as MatchedSymbol[];

      // Step 3 — Get user pattern summary (top 5 recurring symbols by occurrence count).
      const { data: patternRows } = await db
        .from('user_patterns')
        .select('symbol, occurrence_count')
        .eq('user_id', userId)
        .order('occurrence_count', { ascending: false })
        .limit(TOP_RECURRING_SYMBOLS);
      const patterns = (patternRows ?? []) as UserPatternRow[];

      // Step 4 — Build Claude context strings.
      return {
        embedding,
        symbolContext: formatSymbolContext(symbols),
        patternContext: formatPatternContext(patterns),
      };
    },
  };
}
