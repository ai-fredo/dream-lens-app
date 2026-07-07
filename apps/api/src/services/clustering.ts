// apps/api/src/services/clustering.ts
//
// Groups a user's dreams into recurring-theme clusters by cosine similarity
// of their embeddings (union-find over a threshold graph), then caches the
// result in `dream_clusters` so repeat calls in the same "epoch" (same
// dream count) skip recomputation. Spec §6 thresholds: cosine >= 0.82,
// minSize 3.
//
// Per engineering-standards §4.5, dream content (transcripts) must never be
// logged. Read failures degrade to `[]` (no throw) with a code-only warn,
// consistent with patternSummary.ts's existing degraded-mode contract.
// Write failures (cache delete/insert) also warn but do NOT discard the
// work already done: the expensive part — clustering — succeeded, so the
// freshly computed clusters are still returned, mapped locally with a
// 'pending' placeholder id; ids become real db-generated UUIDs on the
// next successful recompute. Only the cache write failed, not the
// computation.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserId, DreamId, DreamCluster } from '@dreamlens/shared/types/domain';
import { logger } from '../middleware/logger';

const THRESHOLD = 0.82;
const MIN_SIZE = 3;

interface DreamVec {
  id: string;
  embedding: number[];
  symbols: string[];
}

/** Row shape for `dreams` as selected by getOrRecompute (id, embedding, symbols only). */
interface DreamRow {
  id: string;
  embedding: unknown;
  symbols: Array<{ symbol: string }> | null;
}

/** Row shape for `dream_clusters` as selected/inserted by getOrRecompute. */
interface ClusterRow {
  id: string;
  label: string;
  dream_ids: string[];
  top_symbols: string[];
  dream_count: number;
  computed_at: string;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! ** 2;
    nb += b[i]! ** 2;
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/**
 * Normalizes a `dreams.embedding` value into a plain number[]. Postgres/
 * supabase-js can deliver a `vector` column as either a native array or a
 * JSON/pgvector string (e.g. "[0.1,0.2,...]") depending on driver version,
 * so this guards against both. Returns null (skip that dream) for anything
 * else — a malformed embedding must not crash clustering for the whole user.
 */
export function parseEmbedding(v: unknown): number[] | null {
  if (Array.isArray(v)) {
    return v.every((x) => typeof x === 'number') ? (v as number[]) : null;
  }
  if (typeof v === 'string') {
    try {
      const parsed: unknown = JSON.parse(v);
      return Array.isArray(parsed) && parsed.every((x) => typeof x === 'number') ? (parsed as number[]) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Pure grouping function: unions dreams whose embeddings are cosine-similar
 * (>= threshold) via union-find with path compression, drops groups smaller
 * than minSize, and returns each surviving group's dreamIds (sorted) and
 * top-3 symbols by occurrence. The final array is sorted by each group's
 * first dreamId for deterministic output ordering.
 */
export function clusterByThreshold(
  dreams: DreamVec[],
  opts: { threshold: number; minSize: number },
): Array<{ dreamIds: string[]; topSymbols: string[] }> {
  const parent = dreams.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const union = (i: number, j: number) => {
    parent[find(i)] = find(j);
  };
  for (let i = 0; i < dreams.length; i++)
    for (let j = i + 1; j < dreams.length; j++)
      if (cosine(dreams[i]!.embedding, dreams[j]!.embedding) >= opts.threshold) union(i, j);

  const groups = new Map<number, number[]>();
  dreams.forEach((_, i) => {
    const r = find(i);
    (groups.get(r) ?? groups.set(r, []).get(r)!).push(i);
  });

  return [...groups.values()]
    .filter((idx) => idx.length >= opts.minSize)
    .map((idx) => {
      const counts = new Map<string, number>();
      idx.forEach((i) => dreams[i]!.symbols.forEach((s) => counts.set(s, (counts.get(s) ?? 0) + 1)));
      const topSymbols = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([s]) => s);
      return { dreamIds: idx.map((i) => dreams[i]!.id).sort(), topSymbols };
    })
    .sort((a, b) => a.dreamIds[0]!.localeCompare(b.dreamIds[0]!)); // deterministic order
}

function toDreamCluster(r: ClusterRow): DreamCluster {
  return {
    id: r.id,
    label: r.label,
    // dream_ids arrives as string[] from Postgres; DreamId is a branded
    // string type with no runtime representation, so this cast is just
    // narrowing to the branded alias — same values, no transformation.
    dreamIds: r.dream_ids as DreamId[],
    topSymbols: r.top_symbols,
    dreamCount: r.dream_count,
    computedAt: new Date(r.computed_at),
  };
}

export function makeClustering(db: SupabaseClient) {
  return {
    async getOrRecompute(userId: UserId): Promise<DreamCluster[]> {
      const { data: dreamData, error: dreamError } = await db
        .from('dreams')
        .select('id,embedding,symbols')
        .eq('user_id', userId)
        .not('embedding', 'is', null);
      if (dreamError) {
        logger.warn({
          event: 'cluster_fetch_failed',
          code: (dreamError as { code?: string }).code ?? 'DB_READ_FAILED',
          message: (dreamError as { message?: string }).message ?? 'Unknown error',
        });
        return [];
      }
      const dreamRows = (dreamData ?? []) as DreamRow[];

      const { data: cachedData, error: cacheError } = await db.from('dream_clusters').select('*').eq('user_id', userId);
      if (cacheError) {
        logger.warn({
          event: 'cluster_fetch_failed',
          code: (cacheError as { code?: string }).code ?? 'DB_READ_FAILED',
          message: (cacheError as { message?: string }).message ?? 'Unknown error',
        });
        return [];
      }
      const cached = (cachedData ?? []) as ClusterRow[];

      // Normalize embeddings; dreams with an unparseable embedding are
      // skipped from clustering (they simply won't join any group).
      const dreamVecs: DreamVec[] = [];
      let skippedCount = 0;
      for (const d of dreamRows) {
        const embedding = parseEmbedding(d.embedding);
        if (!embedding) {
          skippedCount++;
          continue;
        }
        dreamVecs.push({
          id: d.id,
          embedding,
          symbols: (d.symbols ?? []).map((s) => s.symbol),
        });
      }

      // Emit aggregate warn if any embeddings were skipped.
      if (skippedCount > 0) {
        logger.warn({
          event: 'cluster_embedding_parse_skipped',
          count: skippedCount,
        });
      }

      const cachedCount = cached[0]?.dream_count ?? -1;
      if (cached.length > 0 && cachedCount === dreamVecs.length) {
        return cached.map(toDreamCluster);
      }

      const groups = clusterByThreshold(dreamVecs, { threshold: THRESHOLD, minSize: MIN_SIZE });
      const nowIso = new Date().toISOString();
      const rows = groups.map((g) => ({
        user_id: userId,
        label: g.topSymbols[0] ? `Dreams of ${g.topSymbols[0]}` : 'A recurring theme',
        dream_ids: g.dreamIds,
        top_symbols: g.topSymbols,
        dream_count: dreamVecs.length,
      }));

      // Cache write failed: the expensive part (clustering) already
      // succeeded, so return the freshly computed clusters with
      // placeholder ids rather than discarding the work; ids become
      // real db-generated UUIDs on the next successful recompute.
      const computedFallback: DreamCluster[] = rows.map((r) => ({
        id: 'pending',
        label: r.label,
        dreamIds: r.dream_ids as DreamId[],
        topSymbols: r.top_symbols,
        dreamCount: r.dream_count,
        computedAt: new Date(nowIso),
      }));

      const { error: deleteError } = await db.from('dream_clusters').delete().eq('user_id', userId);
      if (deleteError) {
        logger.warn({
          event: 'cluster_write_failed',
          code: (deleteError as { code?: string }).code ?? 'DB_WRITE_FAILED',
          message: (deleteError as { message?: string }).message ?? 'Unknown error',
        });
        return computedFallback;
      }

      if (rows.length) {
        const { error: insertError } = await db.from('dream_clusters').insert(rows);
        if (insertError) {
          logger.warn({
            event: 'cluster_write_failed',
            code: (insertError as { code?: string }).code ?? 'DB_WRITE_FAILED',
            message: (insertError as { message?: string }).message ?? 'Unknown error',
          });
          return computedFallback;
        }
      }

      const { data: freshData, error: freshError } = await db.from('dream_clusters').select('*').eq('user_id', userId);
      if (freshError) {
        logger.warn({
          event: 'cluster_fetch_failed',
          code: (freshError as { code?: string }).code ?? 'DB_READ_FAILED',
          message: (freshError as { message?: string }).message ?? 'Unknown error',
        });
        return computedFallback;
      }
      return ((freshData ?? []) as ClusterRow[]).map(toDreamCluster);
    },
  };
}
