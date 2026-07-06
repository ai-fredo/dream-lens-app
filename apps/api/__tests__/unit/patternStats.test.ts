// apps/api/__tests__/unit/patternStats.test.ts
//
// makePatternStats persists pattern rows via the `increment_user_patterns` RPC
// (see supabase/migrations/20260705120000_pattern_engine.sql) rather than a
// client-side upsert, because supabase-js upsert() would overwrite
// occurrence_count instead of incrementing it. These tests assert the rows
// passed to the RPC, not a client-side upsert call.
import { makePatternStats } from '../../src/services/patternStats';
import type { UserId } from '@dreamlens/shared/types/domain';
import type { SupabaseClient } from '@supabase/supabase-js';

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

function mockDb() {
  const rpcCalls: RpcCall[] = [];
  return {
    rpcCalls,
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ error: null });
    },
    // `mockDb` only implements the `.rpc()` surface makePatternStats uses;
    // cast to SupabaseClient at the test boundary rather than widening the
    // fake's real (narrow, intentional) type.
  } as unknown as SupabaseClient & { rpcCalls: RpcCall[] };
}

it('calls increment_user_patterns with one row per symbol and theme, stamped with the user id', async () => {
  const db = mockDb();
  await makePatternStats(db).updateOnDream('u1' as UserId, {
    symbols: [{ symbol: 'water' }, { symbol: 'house' }],
    themes: ['transition'],
  });

  expect(db.rpcCalls).toHaveLength(1);
  expect(db.rpcCalls[0]!.fn).toBe('increment_user_patterns');

  const rows = db.rpcCalls[0]!.args.p_rows as Array<{ pattern_type: string; label: string; user_id: string }>;
  const labels = rows.map((r) => `${r.pattern_type}:${r.label}`);
  expect(labels).toEqual(expect.arrayContaining(['symbol:water', 'symbol:house', 'theme:transition']));
  expect(rows.every((r) => r.user_id === 'u1')).toBe(true);
});

it('does not call the RPC for empty symbols and themes', async () => {
  const db = mockDb();
  await expect(
    makePatternStats(db).updateOnDream('u1' as UserId, { symbols: [], themes: [] }),
  ).resolves.toBeUndefined();
  expect(db.rpcCalls).toHaveLength(0);
});

it('deduplicates repeated labels within a single dream', async () => {
  const db = mockDb();
  await makePatternStats(db).updateOnDream('u1' as UserId, {
    symbols: [{ symbol: 'water' }, { symbol: 'water' }],
    themes: [],
  });
  const rows = db.rpcCalls[0]!.args.p_rows as Array<{ label: string }>;
  expect(rows.filter((r) => r.label === 'water')).toHaveLength(1);
});
