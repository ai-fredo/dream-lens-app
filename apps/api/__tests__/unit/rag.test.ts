// apps/api/__tests__/unit/rag.test.ts
import { makeRag } from '../../src/services/rag';

// Mock OpenAI client shapes: tests inject fakes rather than the real SDK client (brief's mock-injected style).
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double for OpenAI client, shape-compatible only
const openaiOk = { embeddings: { create: async () => ({ data: [{ embedding: new Array(1536).fill(0.01) }] }) } } as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double for OpenAI client, shape-compatible only
const openaiFail = { embeddings: { create: async () => { throw new Error('down'); } } } as any;

// Builds a fake Supabase client covering both surfaces buildContext touches:
// `.rpc('match_dream_symbols', ...)` (Step 2) and patternSummary's own
// `.from('user_patterns'|'dreams').select().eq().order()` chains (Step 3).
// `patternRows`/`dreamRows` feed patternSummary; `rpcResult` feeds the vector
// search. Errors are keyed per-surface so each test can fail exactly one leg.
interface FakeDbOpts {
  rpcResult?: { data: unknown; error: unknown };
  patternRows?: unknown[];
  patternError?: unknown;
  dreamRows?: unknown[];
  dreamError?: unknown;
}

function fakeDb(opts: FakeDbOpts = {}) {
  const {
    rpcResult = { data: [], error: null },
    patternRows = [],
    patternError = null,
    dreamRows = [],
    dreamError = null,
  } = opts;

  return {
    rpc: async () => rpcResult,
    from: (tbl: string) => ({
      select: () => ({
        eq: () => ({
          order: () =>
            tbl === 'user_patterns'
              ? Promise.resolve({ data: patternError ? null : patternRows, error: patternError })
              : Promise.resolve({ data: dreamError ? null : dreamRows, error: dreamError }),
        }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double for Supabase client, shape-compatible only
  } as any;
}

it('builds symbol context from matched symbols', async () => {
  const db = fakeDb({ rpcResult: { data: [{ symbol: 'water', interpretation: 'flow', category: 'environment' }], error: null } });
  const rag = makeRag(db, openaiOk);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test uses a plain string where UserId is expected
  const ctx = await rag.buildContext('u1' as any, 'I dreamed of water');
  expect(ctx.symbolContext).toContain('water');
  expect(ctx.embedding).toHaveLength(1536);
});

it('degrades gracefully when embedding fails (skips RAG, no throw)', async () => {
  const rag = makeRag(fakeDb(), openaiFail);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test uses a plain string where UserId is expected
  const ctx = await rag.buildContext('u1' as any, 'x');
  expect(ctx.embedding).toBeNull();
  expect(ctx.symbolContext).toBe('');
});

it('degrades gracefully when RPC call returns error (logs warning, symbolContext empty, keeps embedding)', async () => {
  const rpcError = { message: 'RPC failed' };
  const rag = makeRag(fakeDb({ rpcResult: { data: null, error: rpcError } }), openaiOk);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test uses a plain string where UserId is expected
  const ctx = await rag.buildContext('u1' as any, 'I dreamed of water');
  expect(ctx.symbolContext).toBe('');
  expect(ctx.embedding).toHaveLength(1536);
  expect(ctx.patternContext).toBe("This is the user's first dream entry.");
});

it('degrades gracefully when pattern query returns error (logs warning, patternContext is empty string, not the empty-history copy)', async () => {
  const db = fakeDb({ patternError: { message: 'Pattern query failed', code: 'PGRST000' } });
  const rag = makeRag(db, openaiOk);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test uses a plain string where UserId is expected
  const ctx = await rag.buildContext('u1' as any, 'I dreamed of water');
  // patternSummary degrades a user_patterns fetch error to empty pattern data
  // internally (logging its own code-only warning) rather than throwing, but
  // reports degraded: true via getForUserWithMeta. A fetch failure must not
  // be conflated with a genuine empty history: since Claude's §7a prompt
  // treats "first dream entry" copy as fact for patternNote, buildContext
  // must fall back to '' here rather than asserting a false claim.
  expect(ctx.patternContext).toBe('');
  expect(ctx.embedding).toHaveLength(1536);
  expect(ctx.symbolContext).toBe('');
});

it('reports the empty-history copy for a genuinely empty, healthy history (no fetch errors)', async () => {
  const db = fakeDb(); // no patternRows/dreamRows, no errors — healthy db, user has no history yet
  const rag = makeRag(db, openaiOk);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test uses a plain string where UserId is expected
  const ctx = await rag.buildContext('u1' as any, 'I dreamed of water');
  expect(ctx.patternContext).toBe("This is the user's first dream entry.");
  expect(ctx.embedding).toHaveLength(1536);
});

it('includes recurring symbols and themes in patternContext', async () => {
  const db = fakeDb({
    patternRows: [
      { pattern_type: 'symbol', label: 'water', occurrence_count: 7 },
      { pattern_type: 'symbol', label: 'house', occurrence_count: 4 },
      { pattern_type: 'theme', label: 'transition', occurrence_count: 5 },
    ],
    dreamRows: [
      { emotional_tone: 'anxious', edited_transcript: null, raw_transcript: 'dream 1', recorded_at: '2026-07-01' },
      { emotional_tone: 'anxious', edited_transcript: null, raw_transcript: 'dream 2', recorded_at: '2026-07-02' },
    ],
  });
  const rag = makeRag(db, openaiOk);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test uses a plain string where UserId is expected
  const ctx = await rag.buildContext('u1' as any, 'I dreamed of water');
  expect(ctx.patternContext).toContain('Recurring symbols: water(7), house(4)');
  expect(ctx.patternContext).toContain('Recurring themes: transition(5)');
  expect(ctx.patternContext).toContain('Dominant emotional tone: anxious');
  expect(ctx.patternContext).toContain('Total dreams: 2');
});
