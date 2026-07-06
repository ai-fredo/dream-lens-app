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
import type { UserId, UserPatternSummary } from '@dreamlens/shared/types/domain';
import { logger } from '../middleware/logger';
import { makeEmbeddings } from './embeddings';
import { makePatternSummary } from './patternSummary';

const MATCH_COUNT = 15;
const MATCH_THRESHOLD = 0.7;

interface MatchedSymbol {
  symbol: string;
  interpretation: string;
  category: string;
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

/**
 * Formats the user's recurring-symbol/theme history and dominant emotional
 * tone into the block Claude's system prompt expects (§7 Step 4). Compact,
 * line-per-facet format, e.g.:
 *   Recurring symbols: water(7), house(4)
 *   Recurring themes: transition(5)
 *   Dominant emotional tone: anxious
 *   Total dreams: 12
 */
function formatPatternContext(summary: UserPatternSummary): string {
  if (summary.totalDreams === 0) return "This is the user's first dream entry.";

  const lines: string[] = [];
  if (summary.recurringSymbols.length > 0) {
    lines.push(`Recurring symbols: ${summary.recurringSymbols.map((s) => `${s.symbol}(${s.count})`).join(', ')}`);
  }
  if (summary.recurringThemes.length > 0) {
    lines.push(`Recurring themes: ${summary.recurringThemes.map((t) => `${t.theme}(${t.count})`).join(', ')}`);
  }
  if (summary.dominantEmotionalTone) {
    lines.push(`Dominant emotional tone: ${summary.dominantEmotionalTone}`);
  }
  lines.push(`Total dreams: ${summary.totalDreams}`);

  return `USER DREAM HISTORY:\n${lines.join('\n')}`;
}

/**
 * Wraps injected Supabase + OpenAI clients so callers (and tests) can supply
 * fakes with the same shape, following the `makeX(injectedClient)` factory
 * pattern used elsewhere (see middleware/auth.ts, routes/dreams.ts).
 */
export function makeRag(db: SupabaseClient, openai: OpenAI): RagService {
  const embeddings = makeEmbeddings(openai);
  const patternSummary = makePatternSummary(db);

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
      const { data: symbolRows, error: symbolError } = await db.rpc('match_dream_symbols', {
        query_embedding: embedding,
        match_count: MATCH_COUNT,
        match_threshold: MATCH_THRESHOLD,
      });
      let symbolContext = '';
      if (symbolError) {
        logger.warn({
          event: 'vector_search_failed',
          code: 'VECTOR_SEARCH_FAILED',
          message: symbolError.message,
        });
      } else {
        symbolContext = formatSymbolContext((symbolRows ?? []) as MatchedSymbol[]);
      }

      // Step 3 — Get the user's pattern summary (recurring symbols/themes,
      // dominant tone, recent dream summaries). patternSummary.getForUserWithMeta()
      // degrades its own per-table fetch failures to empty data internally
      // (logging a code-only warning there), so it never throws; it also
      // reports whether either underlying query errored via `degraded`. When
      // degraded, the fetched data is unreliable (not a genuine empty
      // history), so patternContext must be '' rather than the "first dream
      // entry" copy — otherwise Claude (per §7a) treats that copy as fact.
      // A genuine unexpected failure here (e.g. a thrown error from the
      // client itself) also degrades patternContext to '' rather than
      // failing the request.
      let patternContext = '';
      try {
        const { summary, degraded } = await patternSummary.getForUserWithMeta(userId);
        if (!degraded) {
          patternContext = formatPatternContext(summary);
        }
      } catch (err) {
        logger.warn({
          event: 'pattern_fetch_failed',
          code: 'PATTERN_FETCH_FAILED',
          message: err instanceof Error ? err.message : 'unknown error',
        });
      }

      // Step 4 — Build Claude context strings.
      return {
        embedding,
        symbolContext,
        patternContext,
      };
    },
  };
}
