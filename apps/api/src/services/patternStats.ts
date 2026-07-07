// apps/api/src/services/patternStats.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserId } from '@dreamlens/shared/types/domain';

interface DreamPatterns {
  symbols: Array<{ symbol: string }>;
  themes: string[];
}

/**
 * §7 Step 8 — for each interpreted symbol/theme, increment the user's pattern
 * occurrence count. supabase-js's `upsert()` can't express `SET count =
 * count + 1` (it would overwrite occurrence_count with the row's literal
 * value instead of incrementing it), so persistence goes through the
 * `increment_user_patterns(p_rows jsonb)` RPC added in
 * supabase/migrations/20260705120000_pattern_engine.sql, which does the
 * INSERT ... ON CONFLICT DO UPDATE occurrence_count = occurrence_count + 1
 * in one round trip.
 */
export function makePatternStats(db: SupabaseClient) {
  return {
    async updateOnDream(userId: UserId, dream: DreamPatterns): Promise<void> {
      const labels = new Map<string, 'symbol' | 'theme'>();
      for (const s of dream.symbols) if (s.symbol) labels.set(`symbol:${s.symbol}`, 'symbol');
      for (const t of dream.themes) if (t) labels.set(`theme:${t}`, 'theme');
      if (labels.size === 0) return;

      const now = new Date().toISOString();
      const rows = [...labels.entries()].map(([key, type]) => ({
        user_id: userId,
        pattern_type: type,
        label: key.slice(type.length + 1),
        occurrence_count: 1,
        last_seen: now,
      }));

      const { error } = await db.rpc('increment_user_patterns', { p_rows: rows });
      if (error) throw error;
    },
  };
}
