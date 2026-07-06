// apps/api/__tests__/unit/insights.test.ts
//
// makeInsights(db).derive(userId, summary) checks each recurring symbol's
// count against SYMBOL_THRESHOLDS = [3, 5, 7]. It fires a `recurring_symbol`
// insight only when count === threshold exactly (not >=), deduping against
// existing `user_insights` rows via payload.key so a crossing already
// recorded never re-fires.
//
// The mock below mirrors the actual chain used by insights.ts:
// `.from('user_insights').select('payload').eq('user_id', userId).eq('type',
// 'recurring_symbol')` resolves directly to `{ data, error }`, and
// `.from('user_insights').insert(rows).select()` resolves to `{ data, error }`.
import { makeInsights } from '../../src/services/insights';
import type { UserId, UserPatternSummary } from '@dreamlens/shared/types/domain';

function mockDb(existingKeys: string[] = [], opts?: { fetchError?: unknown; insertError?: unknown }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () =>
            Promise.resolve(
              opts?.fetchError
                ? { data: null, error: opts.fetchError }
                : { data: existingKeys.map((k) => ({ payload: { key: k } })), error: null },
            ),
        }),
      }),
      insert: (rows: unknown[]) => ({
        select: () =>
          opts?.insertError
            ? Promise.resolve({ data: null, error: opts.insertError })
            : Promise.resolve({ data: rows, error: null }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double, shape-compatible only
  } as any;
}

function summary(count: number): UserPatternSummary {
  return {
    totalDreams: 10,
    recurringSymbols: [{ symbol: 'water', count }],
    recurringThemes: [],
    dominantThemes: [],
    dominantEmotionalTone: 'anxious',
    recentDreamSummaries: [],
  };
}

it('fires a recurring_symbol insight when a symbol reaches 5', async () => {
  const db = mockDb();
  const out = await makeInsights(db).derive('u1' as UserId, summary(5));
  expect(out.some((i) => i.type === 'recurring_symbol')).toBe(true);
});

it('does NOT fire below the threshold (count 4)', async () => {
  const db = mockDb();
  const out = await makeInsights(db).derive('u1' as UserId, summary(4));
  expect(out).toHaveLength(0);
});

it('does NOT double-fire for a crossing already recorded', async () => {
  const db = mockDb(['recurring_symbol:water:5']);
  const out = await makeInsights(db).derive('u1' as UserId, summary(5));
  expect(out).toHaveLength(0);
});

it('returns [] and does not attempt an insert when the existing-keys fetch errors', async () => {
  let insertCalled = false;
  const db = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ data: null, error: { message: 'boom', code: 'PGRST000' } }),
        }),
      }),
      insert: () => {
        insertCalled = true;
        return { select: () => Promise.resolve({ data: null, error: null }) };
      },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double, shape-compatible only
  } as any;
  const out = await makeInsights(db).derive('u1' as UserId, summary(5));
  expect(out).toEqual([]);
  expect(insertCalled).toBe(false);
});

it('returns [] when the insert errors', async () => {
  const db = mockDb([], { insertError: { message: 'boom', code: 'PGRST000' } });
  const out = await makeInsights(db).derive('u1' as UserId, summary(5));
  expect(out).toEqual([]);
});
