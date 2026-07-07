// apps/api/src/services/insights.ts
//
// Derives `user_insights` rows from a user's UserPatternSummary (see
// patternSummary.ts). Currently the only rule implemented is
// `recurring_symbol`: fire once, exactly, the moment a symbol's occurrence
// count crosses one of SYMBOL_THRESHOLDS. "Crosses" means count === threshold
// exactly, not >= — a user whose symbol jumps straight from 2 to 6 (unlikely,
// but not impossible if occurrence_count is ever backfilled/replayed) does
// not retroactively fire the count-3 or count-5 insight, only whatever
// threshold it lands on exactly. This mirrors patternStats.ts's per-dream +1
// semantics, where counts increment one at a time in normal operation.
//
// Dedup: each insight we could fire has a stable payload.key
// (`recurring_symbol:${symbol}:${threshold}`). Before inserting we read the
// user's existing `recurring_symbol` insights and skip any key already
// present, so re-running derive() for the same user/summary never
// double-fires — this is what makes it safe to call derive() on every
// interpret request instead of running it as a separate cron/job.
//
// Per engineering-standards §4.5, dream content (transcripts) must never be
// logged, and title/body here are built only from a derived symbol label
// (e.g. "water") plus a count — never from raw/edited transcript text. On a
// query error we log a code-only warning (event/code/message, no transcript,
// no user id) and degrade to returning [] rather than throwing, consistent
// with patternSummary.ts's degraded-mode contract. On a fetch error we
// deliberately skip inserting altogether (rather than falling back to "no
// existing keys") — inserting without a reliable dedupe set is exactly what
// would cause an insight to double-fire.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserId, Insight, UserPatternSummary } from '@dreamlens/shared/types/domain';
import { logger } from '../middleware/logger';

const SYMBOL_THRESHOLDS = [3, 5, 7];

interface InsightPayload {
  key: string;
  symbol: string;
  count: number;
}

interface UserInsightRow {
  id?: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  payload: InsightPayload;
  created_at?: string;
}

export interface InsightsService {
  derive(userId: UserId, summary: UserPatternSummary): Promise<Insight[]>;
}

export function makeInsights(db: SupabaseClient): InsightsService {
  return {
    async derive(userId: UserId, summary: UserPatternSummary): Promise<Insight[]> {
      const { data: existing, error: fetchError } = await db
        .from('user_insights')
        .select('payload')
        .eq('user_id', userId)
        .eq('type', 'recurring_symbol');
      if (fetchError) {
        logger.warn({
          event: 'insight_fetch_failed',
          code: (fetchError as { code?: string }).code ?? 'DB_READ_FAILED',
          message: fetchError.message,
        });
        // Can't reliably dedupe without the existing-keys read, so we don't
        // insert at all here — that's what prevents double-firing.
        return [];
      }
      const seenKeys = new Set(
        ((existing ?? []) as Array<{ payload: InsightPayload | null }>).map((r) => r.payload?.key),
      );

      const toInsert: UserInsightRow[] = [];
      for (const s of summary.recurringSymbols) {
        const crossed = SYMBOL_THRESHOLDS.filter((t) => s.count === t);
        for (const t of crossed) {
          const key = `recurring_symbol:${s.symbol}:${t}`;
          if (seenKeys.has(key)) continue;
          toInsert.push({
            user_id: userId,
            type: 'recurring_symbol',
            title: `${s.symbol} keeps returning`,
            body: `${s.symbol} has appeared ${t} times in your dreams.`,
            payload: { key, symbol: s.symbol, count: t },
          });
        }
      }
      if (toInsert.length === 0) return [];

      const { data, error: insertError } = await db.from('user_insights').insert(toInsert).select();
      if (insertError) {
        logger.warn({
          event: 'insight_write_failed',
          code: (insertError as { code?: string }).code ?? 'DB_WRITE_FAILED',
          message: insertError.message,
        });
        return [];
      }
      return ((data ?? []) as UserInsightRow[]).map(toInsight);
    },
  };
}

function toInsight(r: UserInsightRow): Insight {
  return {
    id: r.id ?? 'pending',
    type: r.type as Insight['type'],
    title: r.title,
    body: r.body,
    payload: r.payload,
    createdAt: r.created_at ? new Date(r.created_at) : new Date(0),
    seenAt: null,
  };
}
