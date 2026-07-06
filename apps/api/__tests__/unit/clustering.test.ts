// apps/api/__tests__/unit/clustering.test.ts
//
// clusterByThreshold() is a pure union-find grouping function: dreams whose
// embeddings are cosine-similar (>= threshold) are unioned into the same
// group; groups smaller than minSize are dropped; topSymbols/dreamIds are
// sorted for determinism.
//
// makeClustering(db).getOrRecompute(userId) is the lazy-cache wrapper: it
// reads `dreams` (id, embedding, symbols) and the `dream_clusters` cache for
// the user. If the cache is fresh (row count matches current dream count),
// it returns the cached rows mapped to DreamCluster without recomputing.
// Otherwise it recomputes via clusterByThreshold, replaces the cache
// (delete + insert), and returns the freshly computed clusters. Read
// failures degrade to `[]` (no throw); write failures still return the
// freshly computed clusters (compute succeeded, only the cache write
// failed).
import { clusterByThreshold, makeClustering, parseEmbedding } from '../../src/services/clustering';
import type { UserId } from '@dreamlens/shared/types/domain';

const v = (x: number) => [x, 1 - x]; // simple 2-D unit-ish vectors

describe('parseEmbedding', () => {
  it('passes through a numeric array unchanged', () => {
    expect(parseEmbedding([0.1, 0.2, 0.3])).toEqual([0.1, 0.2, 0.3]);
  });

  it('parses a JSON-stringified array (pgvector string form)', () => {
    expect(parseEmbedding('[0.1,0.2,0.3]')).toEqual([0.1, 0.2, 0.3]);
  });

  it('returns null for null, non-numeric, or malformed input', () => {
    expect(parseEmbedding(null)).toBeNull();
    expect(parseEmbedding(undefined)).toBeNull();
    expect(parseEmbedding('not json')).toBeNull();
    expect(parseEmbedding(['a', 'b'])).toBeNull();
    expect(parseEmbedding(42)).toBeNull();
  });
});

it('groups near-identical vectors and drops clusters below minSize', () => {
  const dreams = [
    { id: 'a', embedding: v(0.90), symbols: ['water'] },
    { id: 'b', embedding: v(0.91), symbols: ['water'] },
    { id: 'c', embedding: v(0.92), symbols: ['ocean'] },
    { id: 'z', embedding: v(0.05), symbols: ['fire'] }, // far away, singleton
  ];
  const clusters = clusterByThreshold(dreams, { threshold: 0.99, minSize: 3 });
  expect(clusters).toHaveLength(1);
  expect(clusters[0]!.dreamIds.sort()).toEqual(['a', 'b', 'c']);
  expect(clusters[0]!.topSymbols).toContain('water');
});

it('is deterministic for the same input', () => {
  const dreams = [
    { id: 'a', embedding: v(0.90), symbols: [] },
    { id: 'b', embedding: v(0.91), symbols: [] },
    { id: 'c', embedding: v(0.92), symbols: [] },
  ];
  const a = JSON.stringify(clusterByThreshold(dreams, { threshold: 0.99, minSize: 3 }));
  const b = JSON.stringify(clusterByThreshold(dreams, { threshold: 0.99, minSize: 3 }));
  expect(a).toBe(b);
});

it('returns no clusters when nothing meets the threshold', () => {
  const dreams = [
    { id: 'a', embedding: v(0.1), symbols: [] },
    { id: 'b', embedding: v(0.9), symbols: [] },
  ];
  expect(clusterByThreshold(dreams, { threshold: 0.99, minSize: 2 })).toEqual([]);
});

describe('makeClustering(db).getOrRecompute', () => {
  interface ClusterRow {
    id: string;
    label: string;
    dream_ids: string[];
    top_symbols: string[];
    dream_count: number;
    computed_at: string;
  }

  // Minimal mock mirroring the chain used by clustering.ts:
  //   .from('dreams').select(...).eq('user_id', ...).not('embedding', ...)
  //   .from('dream_clusters').select('*').eq('user_id', ...)
  //   .from('dream_clusters').delete().eq('user_id', ...)
  //   .from('dream_clusters').insert(rows)
  function dbWith(opts: {
    dreamRows: Array<{ id: string; embedding: number[]; symbols: Array<{ symbol: string }> }>;
    cachedRows: ClusterRow[];
    insertSpy?: (rows: unknown[]) => void;
    deleteSpy?: () => void;
  }) {
    let cache = [...opts.cachedRows];
    let nextId = 1;
    return {
      from: (tbl: string) => {
        if (tbl === 'dreams') {
          return {
            select: () => ({
              eq: () => ({
                not: () => Promise.resolve({ data: opts.dreamRows, error: null }),
              }),
            }),
          };
        }
        // dream_clusters
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: cache, error: null }),
          }),
          delete: () => ({
            eq: () => {
              opts.deleteSpy?.();
              cache = [];
              return Promise.resolve({ error: null });
            },
          }),
          insert: (rows: Array<Omit<ClusterRow, 'id' | 'computed_at'>>) => {
            opts.insertSpy?.(rows);
            cache = rows.map((r) => ({ ...r, id: `new-${nextId++}`, computed_at: '2026-07-05T00:00:00.000Z' }));
            return Promise.resolve({ error: null });
          },
        };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double, shape-compatible only
    } as any;
  }

  it('returns mapped cache without recomputing when cache is fresh (dream_count matches)', async () => {
    const insertSpy = jest.fn();
    const deleteSpy = jest.fn();
    const db = dbWith({
      dreamRows: [
        { id: 'a', embedding: v(0.9), symbols: [{ symbol: 'water' }] },
        { id: 'b', embedding: v(0.91), symbols: [{ symbol: 'water' }] },
      ],
      cachedRows: [
        {
          id: 'cluster-1',
          label: 'Dreams of water',
          dream_ids: ['a', 'b'],
          top_symbols: ['water'],
          dream_count: 2,
          computed_at: '2026-07-01T00:00:00.000Z',
        },
      ],
      insertSpy,
      deleteSpy,
    });

    const result = await makeClustering(db).getOrRecompute('u1' as UserId);

    expect(result).toEqual([
      {
        id: 'cluster-1',
        label: 'Dreams of water',
        dreamIds: ['a', 'b'],
        topSymbols: ['water'],
        dreamCount: 2,
        computedAt: new Date('2026-07-01T00:00:00.000Z'),
      },
    ]);
    expect(insertSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('recomputes and writes the cache when cached dream_count is stale', async () => {
    const insertSpy = jest.fn();
    const deleteSpy = jest.fn();
    const db = dbWith({
      dreamRows: [
        { id: 'a', embedding: v(0.9), symbols: [{ symbol: 'water' }] },
        { id: 'b', embedding: v(0.91), symbols: [{ symbol: 'water' }] },
        { id: 'c', embedding: v(0.92), symbols: [{ symbol: 'ocean' }] },
      ],
      cachedRows: [
        {
          id: 'stale-1',
          label: 'stale',
          dream_ids: ['a'],
          top_symbols: [],
          dream_count: 1, // stale: doesn't match current dream count of 3
          computed_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      insertSpy,
      deleteSpy,
    });

    const result = await makeClustering(db).getOrRecompute('u1' as UserId);

    expect(deleteSpy).toHaveBeenCalled();
    expect(insertSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        user_id: 'u1',
        dream_ids: ['a', 'b', 'c'],
        dream_count: 3,
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.dreamIds.slice().sort()).toEqual(['a', 'b', 'c']);
  });
});
