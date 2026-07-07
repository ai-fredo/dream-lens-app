// apps/api/src/services/patternSummary.ts
//
// Reads a user's persisted pattern rows (`user_patterns`, populated by
// patternStats.ts) plus their `dreams` history and folds both into a single
// UserPatternSummary for the RAG context builder (rag.ts) to feed Claude.
//
// Per engineering-standards §4.5, dream content (transcripts) must never be
// logged. On a query error we log a code-only warning (event/code/message —
// no transcript content, no user id) and degrade to empty data rather than
// throwing, consistent with rag.ts's existing degraded-mode contract.
//
// getForUserWithMeta() additionally reports whether either underlying query
// errored (`degraded: true`) so callers (rag.ts) can distinguish "fetch
// failed, data is unreliable" from "fetch succeeded, user genuinely has no
// history" — the two must not be conflated into the same Claude-facing copy.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserId, UserPatternSummary } from '@dreamlens/shared/types/domain';
import { logger } from '../middleware/logger';

const TOP_N = 5;
const RECENT_DREAMS = 3;
const SUMMARY_CHARS = 120;

interface PatternRow {
  pattern_type: 'symbol' | 'theme';
  label: string;
  occurrence_count: number;
}

interface DreamRow {
  emotional_tone: string | null;
  edited_transcript: string | null;
  raw_transcript: string | null;
  recorded_at: string;
}

export interface PatternSummaryWithMeta {
  summary: UserPatternSummary;
  degraded: boolean;
}

export interface PatternSummaryService {
  getForUser(userId: UserId): Promise<UserPatternSummary>;
  getForUserWithMeta(userId: UserId): Promise<PatternSummaryWithMeta>;
}

export function makePatternSummary(db: SupabaseClient): PatternSummaryService {
  async function getForUserWithMeta(userId: UserId): Promise<PatternSummaryWithMeta> {
    const { data: patternData, error: patternError } = await db
      .from('user_patterns')
      .select('pattern_type,label,occurrence_count')
      .eq('user_id', userId)
      .order('occurrence_count', { ascending: false });
    if (patternError) {
      logger.warn({
        event: 'pattern_summary_patterns_fetch_failed',
        code: (patternError as { code?: string }).code ?? 'UNKNOWN',
        message: patternError.message,
      });
    }
    const patterns = (patternError ? [] : (patternData ?? [])) as PatternRow[];

    const { data: dreamData, error: dreamError } = await db
      .from('dreams')
      .select('emotional_tone,edited_transcript,raw_transcript,recorded_at')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: false });
    if (dreamError) {
      logger.warn({
        event: 'pattern_summary_dreams_fetch_failed',
        code: (dreamError as { code?: string }).code ?? 'UNKNOWN',
        message: dreamError.message,
      });
    }
    const dreams = (dreamError ? [] : (dreamData ?? [])) as DreamRow[];

    const recurringSymbols = patterns
      .filter((r) => r.pattern_type === 'symbol')
      .slice(0, TOP_N)
      .map((r) => ({ symbol: r.label, count: r.occurrence_count }));
    const recurringThemesList = patterns
      .filter((r) => r.pattern_type === 'theme')
      .slice(0, TOP_N)
      .map((r) => ({ theme: r.label, count: r.occurrence_count }));

    const toneCounts = new Map<string, number>();
    for (const row of dreams) {
      if (row.emotional_tone) toneCounts.set(row.emotional_tone, (toneCounts.get(row.emotional_tone) ?? 0) + 1);
    }
    const dominantEmotionalTone = [...toneCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return {
      summary: {
        totalDreams: dreams.length,
        recurringSymbols,
        recurringThemes: recurringThemesList,
        dominantThemes: recurringThemesList.map((t) => t.theme),
        dominantEmotionalTone,
        recentDreamSummaries: dreams
          .slice(0, RECENT_DREAMS)
          .map((r) => (r.edited_transcript ?? r.raw_transcript ?? '').slice(0, SUMMARY_CHARS)),
      },
      degraded: Boolean(patternError) || Boolean(dreamError),
    };
  }

  return {
    async getForUser(userId: UserId): Promise<UserPatternSummary> {
      return (await getForUserWithMeta(userId)).summary;
    },
    getForUserWithMeta,
  };
}
