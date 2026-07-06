// apps/api/__tests__/unit/patternSummary.test.ts
//
// makePatternSummary(db).getForUser() queries user_patterns (pattern_type,
// label, occurrence_count) and dreams (emotional_tone, edited_transcript,
// raw_transcript, recorded_at) for a user, and folds them into a
// UserPatternSummary: top-5 recurring symbols/themes by count, the dominant
// emotional tone, total dream count, and up to 3 recent dream summaries
// (transcript, truncated to 120 chars).
//
// The mock below mirrors the actual chain used by patternSummary.ts:
// `.from(tbl).select(cols).eq('user_id', userId).order(col, opts)` resolves
// directly to `{ data, error }` for both tables — there is no separate
// `.limit()` call in the implementation (slicing to top-5 / recent-3 happens
// in JS), so the mock only needs to honor `.order()` as the terminal,
// awaitable step.
import { makePatternSummary } from '../../src/services/patternSummary';
import type { UserId } from '@dreamlens/shared/types/domain';

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

function dbWith(patternRows: PatternRow[], dreamRows: DreamRow[], opts?: { patternError?: unknown; dreamError?: unknown }) {
  return {
    from: (tbl: string) => ({
      select: () => ({
        eq: () => ({
          order: () =>
            tbl === 'user_patterns'
              ? Promise.resolve({ data: opts?.patternError ? null : patternRows, error: opts?.patternError ?? null })
              : Promise.resolve({ data: opts?.dreamError ? null : dreamRows, error: opts?.dreamError ?? null }),
        }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double, shape-compatible only
  } as any;
}

it('returns empty summary for a user with no dreams', async () => {
  const s = await makePatternSummary(dbWith([], [])).getForUser('u1' as UserId);
  expect(s).toEqual({
    totalDreams: 0,
    recurringSymbols: [],
    recurringThemes: [],
    dominantThemes: [],
    dominantEmotionalTone: null,
    recentDreamSummaries: [],
  });
});

it('returns top-5 symbols and themes by count, descending', async () => {
  const patterns: PatternRow[] = [
    { pattern_type: 'symbol', label: 'water', occurrence_count: 7 },
    { pattern_type: 'symbol', label: 'house', occurrence_count: 4 },
    { pattern_type: 'theme', label: 'transition', occurrence_count: 5 },
  ];
  const dreams: DreamRow[] = [
    { emotional_tone: 'anxious', edited_transcript: null, raw_transcript: 'a', recorded_at: '2026-07-01' },
    { emotional_tone: 'anxious', edited_transcript: null, raw_transcript: 'b', recorded_at: '2026-07-02' },
    { emotional_tone: 'calm', edited_transcript: null, raw_transcript: 'c', recorded_at: '2026-07-03' },
  ];
  const s = await makePatternSummary(dbWith(patterns, dreams)).getForUser('u1' as UserId);
  expect(s.recurringSymbols[0]).toEqual({ symbol: 'water', count: 7 });
  expect(s.recurringThemes[0]).toEqual({ theme: 'transition', count: 5 });
  expect(s.dominantEmotionalTone).toBe('anxious');
  expect(s.totalDreams).toBe(3);
});

it('degrades to empty pattern data on user_patterns query error (no throw)', async () => {
  const s = await makePatternSummary(
    dbWith([], [{ emotional_tone: 'calm', edited_transcript: null, raw_transcript: 'x', recorded_at: '2026-07-01' }], {
      patternError: { message: 'boom', code: 'PGRST000' },
    }),
  ).getForUser('u1' as UserId);
  expect(s.recurringSymbols).toEqual([]);
  expect(s.recurringThemes).toEqual([]);
  expect(s.totalDreams).toBe(1);
  expect(s.dominantEmotionalTone).toBe('calm');
});

it('degrades to empty dream data on dreams query error (no throw)', async () => {
  const s = await makePatternSummary(
    dbWith([{ pattern_type: 'symbol', label: 'water', occurrence_count: 3 }], [], {
      dreamError: { message: 'boom', code: 'PGRST000' },
    }),
  ).getForUser('u1' as UserId);
  expect(s.recurringSymbols).toEqual([{ symbol: 'water', count: 3 }]);
  expect(s.totalDreams).toBe(0);
  expect(s.dominantEmotionalTone).toBeNull();
  expect(s.recentDreamSummaries).toEqual([]);
});

it('truncates recent dream summaries to 120 chars and caps at 3', async () => {
  const longText = 'x'.repeat(200);
  const dreams: DreamRow[] = Array.from({ length: 5 }, (_, i) => ({
    emotional_tone: 'calm',
    edited_transcript: null,
    raw_transcript: longText,
    recorded_at: `2026-07-0${i + 1}`,
  }));
  const s = await makePatternSummary(dbWith([], dreams)).getForUser('u1' as UserId);
  expect(s.recentDreamSummaries).toHaveLength(3);
  expect(s.recentDreamSummaries[0]).toHaveLength(120);
});
