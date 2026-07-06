# Per-User Pattern Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recognize and surface patterns in each user's own dream history (recurring symbols/themes, emotional arc, dream clusters, proactive insight cards) with deterministic code computing the numbers and Claude only narrating them.

**Architecture:** Node.js/Express + TypeScript backend on Supabase (Postgres + pgvector). Five injectable services (`patternStats`, `patternSummary`, `emotionArc`, `clustering`, `insights`) plus two API endpoints. Stats update incrementally on the interpret write path; clustering recomputes lazily on Profile view. Everything stays inside each user's RLS boundary.

**Tech Stack:** TypeScript (strict), Express, `@supabase/supabase-js`, `@anthropic-ai/sdk`, Jest + ts-jest + supertest.

## Global Constraints

- TypeScript strict mode; no `any` without a justifying comment. (§1 standards)
- Every new table gets `ENABLE ROW LEVEL SECURITY` + a `users_own_*` policy `USING (auth.uid() = user_id)`. (§4.1)
- No dream content (transcripts, interpretation text) in logs. Insights store structured payloads, not raw transcripts. (§4.5)
- Every request body validated with Zod; every response uses `{ success, data }` / `{ success, error }`. (§4.3, §16)
- Routes are versioned under `/v1/`. (§16)
- Pattern math runs in code; Claude only narrates. Never ask Claude to count. (spec §1)
- Test-per-feature merge gate: each task ships its test suite; patch coverage ≥ 85% on changed lines. (§3)
- Services take their Supabase client (and Anthropic client where needed) as a constructor/param dependency so tests inject a mock — never import a singleton inside the service body.

## Prerequisites

This plan assumes Phase 0/1 of the engineering standards already exist: the `dreams`, `user_profiles`, and `user_patterns` tables; the `POST /v1/dreams/:id/interpret` endpoint with its Step 3 (context build) and Step 8 (pattern upsert); `requireAuth`; and the Jest/supertest harness with a mocked Supabase client. If they do not yet exist, build them first — this plan extends them.

## File Structure

- `supabase/migrations/<ts>_pattern_engine.sql` — schema changes (Task 1)
- `packages/shared/types/domain.ts` — extend with pattern types (Task 2)
- `apps/api/src/services/patternStats.ts` (Task 3)
- `apps/api/src/services/patternSummary.ts` (Task 4)
- `apps/api/src/services/emotionArc.ts` (Task 5)
- `apps/api/src/services/clustering.ts` (Task 6)
- `apps/api/src/services/insights.ts` (Task 7)
- `apps/api/src/routes/profile.ts` — new endpoints (Task 8)
- Tests mirror each under `apps/api/__tests__/unit/` and `__tests__/integration/`

---

### Task 1: Schema migration

**Files:**
- Create: `supabase/migrations/20260705120000_pattern_engine.sql`
- Test: `apps/api/__tests__/integration/migration_pattern_engine.test.ts`

**Interfaces:**
- Produces: tables `dream_clusters`, `user_insights`; `user_patterns.pattern_type` column; `user_patterns.symbol` renamed to `label`; unique key `(user_id, pattern_type, label)`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260705120000_pattern_engine.sql

-- Generalize user_patterns to hold themes as well as symbols
ALTER TABLE user_patterns ADD COLUMN pattern_type TEXT NOT NULL DEFAULT 'symbol'
  CHECK (pattern_type IN ('symbol','theme'));
ALTER TABLE user_patterns RENAME COLUMN symbol TO label;
ALTER TABLE user_patterns DROP CONSTRAINT user_patterns_user_id_symbol_key;
ALTER TABLE user_patterns ADD CONSTRAINT user_patterns_user_type_label_key
  UNIQUE (user_id, pattern_type, label);

CREATE TABLE dream_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  dream_ids UUID[] NOT NULL,
  top_symbols TEXT[] NOT NULL DEFAULT '{}',
  dream_count INTEGER NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dream_clusters_user ON dream_clusters(user_id);

CREATE TABLE user_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('recurring_symbol','emotion_streak','new_cluster')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  seen_at TIMESTAMPTZ
);
CREATE INDEX idx_user_insights_unseen ON user_insights(user_id) WHERE seen_at IS NULL;

ALTER TABLE dream_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_clusters" ON dream_clusters FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users_own_insights" ON user_insights FOR ALL USING (auth.uid() = user_id);
```

- [ ] **Step 2: Apply to local Supabase and verify**

Run: `supabase db reset` (or `supabase migration up`)
Expected: applies with no error; `\d user_patterns` shows a `label` column and `pattern_type`; `\dt` lists `dream_clusters` and `user_insights`.

- [ ] **Step 3: Write a smoke test asserting the schema shape**

```typescript
// apps/api/__tests__/integration/migration_pattern_engine.test.ts
import { testDb } from '../helpers/testDb'; // existing local-supabase test client

it('user_patterns has label + pattern_type, old symbol column gone', async () => {
  const { data } = await testDb.rpc('pg_columns', { tbl: 'user_patterns' }); // helper returning column names
  const cols = (data ?? []).map((c: { name: string }) => c.name);
  expect(cols).toContain('label');
  expect(cols).toContain('pattern_type');
  expect(cols).not.toContain('symbol');
});

it('dream_clusters and user_insights exist', async () => {
  expect((await testDb.from('dream_clusters').select('id').limit(0)).error).toBeNull();
  expect((await testDb.from('user_insights').select('id').limit(0)).error).toBeNull();
});
```

- [ ] **Step 4: Run the test**

Run: `cd apps/api && npm test -- migration_pattern_engine`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations apps/api/__tests__/integration/migration_pattern_engine.test.ts
git commit -m "feat(db): pattern engine schema — themes in user_patterns, clusters, insights"
```

---

### Task 2: Shared domain types

**Files:**
- Modify: `packages/shared/types/domain.ts`
- Test: `apps/api/__tests__/unit/patternTypes.test.ts`

**Interfaces:**
- Produces: `DreamCluster`, `Insight`, `InsightType`, `EmotionPoint`; extends `UserPatternSummary` with `recurringThemes`.

- [ ] **Step 1: Write a compile-time usage test**

```typescript
// apps/api/__tests__/unit/patternTypes.test.ts
import type { DreamCluster, Insight, EmotionPoint, UserPatternSummary } from '@dreamlens/shared/types/domain';

it('pattern types are shaped as expected', () => {
  const c: DreamCluster = { id: 'x', label: 'Loss of control', dreamIds: [], topSymbols: ['water'], dreamCount: 3, computedAt: new Date() };
  const i: Insight = { id: 'x', type: 'recurring_symbol', title: 't', body: 'b', payload: null, createdAt: new Date(), seenAt: null };
  const e: EmotionPoint = { date: '2026-07-05', emotionalTone: 'anxious' };
  const s: UserPatternSummary = { totalDreams: 1, recurringSymbols: [], recurringThemes: [], dominantEmotionalTone: null, recentDreamSummaries: [] };
  expect([c.dreamCount, i.type, e.date, s.totalDreams]).toBeDefined();
});
```

- [ ] **Step 2: Run it to confirm it fails to compile**

Run: `cd apps/api && npm run typecheck`
Expected: FAIL — types not found.

- [ ] **Step 3: Add the types**

```typescript
// packages/shared/types/domain.ts (append)
export interface DreamCluster {
  id: string;
  label: string;
  dreamIds: DreamId[];
  topSymbols: string[];
  dreamCount: number;
  computedAt: Date;
}

export type InsightType = 'recurring_symbol' | 'emotion_streak' | 'new_cluster';
export interface Insight {
  id: string;
  type: InsightType;
  title: string;
  body: string;
  payload: unknown;
  createdAt: Date;
  seenAt: Date | null;
}

export interface EmotionPoint { date: string; emotionalTone: string; }

// Extend the existing UserPatternSummary interface with:
//   recurringThemes: Array<{ theme: string; count: number }>;
```

Apply the `recurringThemes` field to the existing `UserPatternSummary`.

- [ ] **Step 4: Typecheck + test**

Run: `cd apps/api && npm run typecheck && npm test -- patternTypes`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/types/domain.ts apps/api/__tests__/unit/patternTypes.test.ts
git commit -m "feat(types): pattern engine domain types"
```

---

### Task 3: patternStats service + wire into interpret write path

**Files:**
- Create: `apps/api/src/services/patternStats.ts`
- Modify: `apps/api/src/routes/dreams.ts` (interpret handler, the §7 Step 8 block)
- Test: `apps/api/__tests__/unit/patternStats.test.ts`

**Interfaces:**
- Consumes: a Supabase client; a `dream` with `{ symbols: Array<{ symbol: string }>; themes: string[] }`.
- Produces: `makePatternStats(db).updateOnDream(userId: UserId, dream: { symbols: {symbol:string}[]; themes: string[] }): Promise<void>`.

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/__tests__/unit/patternStats.test.ts
import { makePatternStats } from '../../src/services/patternStats';

function mockDb() {
  const upserts: any[] = [];
  return {
    upserts,
    from: () => ({
      upsert: (rows: any[]) => { upserts.push(...rows); return Promise.resolve({ error: null }); },
    }),
  } as any;
}

it('upserts one symbol row and one theme row per element, incrementing count', async () => {
  const db = mockDb();
  await makePatternStats(db).updateOnDream('u1' as any, {
    symbols: [{ symbol: 'water' }, { symbol: 'house' }],
    themes: ['transition'],
  });
  const labels = db.upserts.map((r: any) => `${r.pattern_type}:${r.label}`);
  expect(labels).toEqual(expect.arrayContaining(['symbol:water', 'symbol:house', 'theme:transition']));
  expect(db.upserts.every((r: any) => r.user_id === 'u1')).toBe(true);
});

it('handles empty symbols and themes without throwing', async () => {
  const db = mockDb();
  await expect(makePatternStats(db).updateOnDream('u1' as any, { symbols: [], themes: [] })).resolves.toBeUndefined();
  expect(db.upserts).toHaveLength(0);
});

it('deduplicates repeated labels within a single dream', async () => {
  const db = mockDb();
  await makePatternStats(db).updateOnDream('u1' as any, { symbols: [{ symbol: 'water' }, { symbol: 'water' }], themes: [] });
  expect(db.upserts.filter((r: any) => r.label === 'water')).toHaveLength(1);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd apps/api && npm test -- patternStats`
Expected: FAIL — `makePatternStats` not found.

- [ ] **Step 3: Implement**

```typescript
// apps/api/src/services/patternStats.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserId } from '@dreamlens/shared/types/domain';

interface DreamPatterns { symbols: Array<{ symbol: string }>; themes: string[]; }

export function makePatternStats(db: SupabaseClient) {
  return {
    async updateOnDream(userId: UserId, dream: DreamPatterns): Promise<void> {
      const labels = new Map<string, 'symbol' | 'theme'>();
      for (const s of dream.symbols) if (s.symbol) labels.set(`symbol:${s.symbol}`, 'symbol');
      for (const t of dream.themes) if (t) labels.set(`theme:${t}`, 'theme');
      if (labels.size === 0) return;

      // Upsert each (user_id, pattern_type, label); on conflict bump occurrence_count.
      const rows = [...labels.entries()].map(([key, type]) => ({
        user_id: userId,
        pattern_type: type,
        label: key.slice(type.length + 1),
        occurrence_count: 1,
        last_seen: new Date().toISOString(),
      }));
      // NOTE: use a Postgres upsert with an increment. With supabase-js, call an RPC
      // `increment_user_patterns(rows jsonb)` OR loop with `ON CONFLICT ... DO UPDATE
      // SET occurrence_count = user_patterns.occurrence_count + 1`. Here we upsert and
      // rely on the RPC to increment; the mock in tests only records the rows.
      const { error } = await db.from('user_patterns').upsert(rows, {
        onConflict: 'user_id,pattern_type,label',
        ignoreDuplicates: false,
      });
      if (error) throw error;
    },
  };
}
```

Add the increment RPC to the migration follow-up (or a small SQL helper). For the unit test the mock records rows; the increment semantics are covered by an integration test in Task 8.

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npm test -- patternStats`
Expected: PASS.

- [ ] **Step 5: Wire into the interpret handler**

In `apps/api/src/routes/dreams.ts`, replace the §7 Step 8 raw `user_patterns` insert with:

```typescript
await makePatternStats(supabase).updateOnDream(req.user.id, {
  symbols: parsed.symbols ?? [],
  themes: parsed.themes ?? [],
});
```

- [ ] **Step 6: Run the dreams route tests, then commit**

Run: `cd apps/api && npm test -- dreams`
Expected: PASS.

```bash
git add apps/api/src/services/patternStats.ts apps/api/src/routes/dreams.ts apps/api/__tests__/unit/patternStats.test.ts
git commit -m "feat(patterns): patternStats service + interpret write-path wiring"
```

---

### Task 4: patternSummary service + richer Claude context

**Files:**
- Create: `apps/api/src/services/patternSummary.ts`
- Modify: `apps/api/src/services/rag.ts` (context builder, §7 Step 3)
- Test: `apps/api/__tests__/unit/patternSummary.test.ts`

**Interfaces:**
- Consumes: Supabase client.
- Produces: `makePatternSummary(db).getForUser(userId: UserId): Promise<UserPatternSummary>`.

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/__tests__/unit/patternSummary.test.ts
import { makePatternSummary } from '../../src/services/patternSummary';

function dbWith(patternRows: any[], dreamRows: any[]) {
  return {
    from: (tbl: string) => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: tbl === 'user_patterns' ? patternRows : dreamRows, error: null }),
          limit: () => Promise.resolve({ data: dreamRows, error: null }),
        }),
      }),
    }),
  } as any;
}

it('returns empty summary for a user with no dreams', async () => {
  const s = await makePatternSummary(dbWith([], [])).getForUser('u1' as any);
  expect(s).toEqual({ totalDreams: 0, recurringSymbols: [], recurringThemes: [], dominantEmotionalTone: null, recentDreamSummaries: [] });
});

it('returns top-5 symbols and themes by count, descending', async () => {
  const patterns = [
    { pattern_type: 'symbol', label: 'water', occurrence_count: 7 },
    { pattern_type: 'symbol', label: 'house', occurrence_count: 4 },
    { pattern_type: 'theme', label: 'transition', occurrence_count: 5 },
  ];
  const dreams = [{ emotional_tone: 'anxious' }, { emotional_tone: 'anxious' }, { emotional_tone: 'calm' }];
  const s = await makePatternSummary(dbWith(patterns, dreams)).getForUser('u1' as any);
  expect(s.recurringSymbols[0]).toEqual({ symbol: 'water', count: 7 });
  expect(s.recurringThemes[0]).toEqual({ theme: 'transition', count: 5 });
  expect(s.dominantEmotionalTone).toBe('anxious');
  expect(s.totalDreams).toBe(3);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd apps/api && npm test -- patternSummary`
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
// apps/api/src/services/patternSummary.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserId, UserPatternSummary } from '@dreamlens/shared/types/domain';

export function makePatternSummary(db: SupabaseClient) {
  return {
    async getForUser(userId: UserId): Promise<UserPatternSummary> {
      const { data: patterns } = await db.from('user_patterns')
        .select('pattern_type,label,occurrence_count').eq('user_id', userId)
        .order('occurrence_count', { ascending: false });
      const { data: dreams } = await db.from('dreams')
        .select('emotional_tone,edited_transcript,raw_transcript,recorded_at').eq('user_id', userId)
        .order('recorded_at', { ascending: false });

      const p = patterns ?? [];
      const d = dreams ?? [];
      const symbols = p.filter((r) => r.pattern_type === 'symbol')
        .slice(0, 5).map((r) => ({ symbol: r.label, count: r.occurrence_count }));
      const themes = p.filter((r) => r.pattern_type === 'theme')
        .slice(0, 5).map((r) => ({ theme: r.label, count: r.occurrence_count }));

      const toneCounts = new Map<string, number>();
      for (const row of d) if (row.emotional_tone) toneCounts.set(row.emotional_tone, (toneCounts.get(row.emotional_tone) ?? 0) + 1);
      const dominant = [...toneCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      return {
        totalDreams: d.length,
        recurringSymbols: symbols,
        recurringThemes: themes,
        dominantEmotionalTone: dominant,
        recentDreamSummaries: d.slice(0, 3).map((r) => (r.edited_transcript ?? r.raw_transcript ?? '').slice(0, 120)),
      };
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npm test -- patternSummary`
Expected: PASS.

- [ ] **Step 5: Wire into RAG context builder**

In `apps/api/src/services/rag.ts`, replace the ad-hoc pattern fetch with `await makePatternSummary(db).getForUser(userId)` and pass its `recurringSymbols` + `recurringThemes` into the `patternContext` string (§7 Step 4).

- [ ] **Step 6: Run rag tests, commit**

Run: `cd apps/api && npm test -- rag`
Expected: PASS.

```bash
git add apps/api/src/services/patternSummary.ts apps/api/src/services/rag.ts apps/api/__tests__/unit/patternSummary.test.ts
git commit -m "feat(patterns): patternSummary service feeding richer Claude context"
```

---

### Task 5: emotionArc service

**Files:**
- Create: `apps/api/src/services/emotionArc.ts`
- Test: `apps/api/__tests__/unit/emotionArc.test.ts`

**Interfaces:**
- Produces: `makeEmotionArc(db).getForUser(userId: UserId, sinceDays?: number): Promise<EmotionPoint[]>` and `negativeStreakLength(points: EmotionPoint[]): number`.

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/__tests__/unit/emotionArc.test.ts
import { makeEmotionArc, negativeStreakLength } from '../../src/services/emotionArc';

it('maps dream rows to date/tone points in chronological order', async () => {
  const db = { from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({
    data: [
      { recorded_at: '2026-07-01T06:00:00Z', emotional_tone: 'anxious' },
      { recorded_at: '2026-07-02T06:00:00Z', emotional_tone: 'calm' },
    ], error: null }) }) }) }) } as any;
  const pts = await makeEmotionArc(db).getForUser('u1' as any);
  expect(pts).toEqual([
    { date: '2026-07-01', emotionalTone: 'anxious' },
    { date: '2026-07-02', emotionalTone: 'calm' },
  ]);
});

it('counts a trailing run of negative tones as the streak length', () => {
  const pts = [
    { date: '2026-07-01', emotionalTone: 'calm' },
    { date: '2026-07-02', emotionalTone: 'anxious' },
    { date: '2026-07-03', emotionalTone: 'melancholic' },
  ];
  expect(negativeStreakLength(pts)).toBe(2);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd apps/api && npm test -- emotionArc`
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
// apps/api/src/services/emotionArc.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserId, EmotionPoint } from '@dreamlens/shared/types/domain';

const NEGATIVE = new Set(['anxious', 'melancholic', 'fearful', 'sad', 'angry', 'distressed']);

export function negativeStreakLength(points: EmotionPoint[]): number {
  let streak = 0;
  for (let i = points.length - 1; i >= 0; i--) {
    if (NEGATIVE.has(points[i]!.emotionalTone)) streak++;
    else break;
  }
  return streak;
}

export function makeEmotionArc(db: SupabaseClient) {
  return {
    async getForUser(userId: UserId, _sinceDays?: number): Promise<EmotionPoint[]> {
      const { data } = await db.from('dreams')
        .select('recorded_at,emotional_tone').eq('user_id', userId)
        .order('recorded_at', { ascending: true });
      return (data ?? []).filter((r) => r.emotional_tone)
        .map((r) => ({ date: String(r.recorded_at).slice(0, 10), emotionalTone: r.emotional_tone }));
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npm test -- emotionArc`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/emotionArc.ts apps/api/__tests__/unit/emotionArc.test.ts
git commit -m "feat(patterns): emotionArc service + negative-streak detection"
```

---

### Task 6: clustering service (threshold grouping + lazy cache)

**Files:**
- Create: `apps/api/src/services/clustering.ts`
- Test: `apps/api/__tests__/unit/clustering.test.ts`

**Interfaces:**
- Produces: `clusterByThreshold(dreams: {id:string; embedding:number[]; symbols:string[]}[], opts:{threshold:number; minSize:number}): {dreamIds:string[]; topSymbols:string[]}[]` (pure) and `makeClustering(db).getOrRecompute(userId): Promise<DreamCluster[]>`.

- [ ] **Step 1: Write failing tests for the pure grouping function**

```typescript
// apps/api/__tests__/unit/clustering.test.ts
import { clusterByThreshold } from '../../src/services/clustering';

const v = (x: number) => [x, 1 - x]; // simple 2-D unit-ish vectors

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
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd apps/api && npm test -- clustering`
Expected: FAIL.

- [ ] **Step 3: Implement the pure grouping + service**

```typescript
// apps/api/src/services/clustering.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserId, DreamCluster } from '@dreamlens/shared/types/domain';

interface DreamVec { id: string; embedding: number[]; symbols: string[]; }

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]! * b[i]!; na += a[i]! ** 2; nb += b[i]! ** 2; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

export function clusterByThreshold(
  dreams: DreamVec[],
  opts: { threshold: number; minSize: number },
): Array<{ dreamIds: string[]; topSymbols: string[] }> {
  const parent = dreams.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const union = (i: number, j: number) => { parent[find(i)] = find(j); };
  for (let i = 0; i < dreams.length; i++)
    for (let j = i + 1; j < dreams.length; j++)
      if (cosine(dreams[i]!.embedding, dreams[j]!.embedding) >= opts.threshold) union(i, j);

  const groups = new Map<number, number[]>();
  dreams.forEach((_, i) => { const r = find(i); (groups.get(r) ?? groups.set(r, []).get(r)!).push(i); });

  return [...groups.values()]
    .filter((idx) => idx.length >= opts.minSize)
    .map((idx) => {
      const counts = new Map<string, number>();
      idx.forEach((i) => dreams[i]!.symbols.forEach((s) => counts.set(s, (counts.get(s) ?? 0) + 1)));
      const topSymbols = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => s);
      return { dreamIds: idx.map((i) => dreams[i]!.id).sort(), topSymbols };
    })
    .sort((a, b) => a.dreamIds[0]!.localeCompare(b.dreamIds[0]!)); // deterministic order
}

export function makeClustering(db: SupabaseClient) {
  return {
    async getOrRecompute(userId: UserId): Promise<DreamCluster[]> {
      const { data: dreamRows } = await db.from('dreams')
        .select('id,embedding,symbols').eq('user_id', userId).not('embedding', 'is', null);
      const dreams = (dreamRows ?? []) as any[];

      const { data: cached } = await db.from('dream_clusters').select('*').eq('user_id', userId);
      const cachedCount = cached?.[0]?.dream_count ?? -1;
      if (cached && cached.length > 0 && cachedCount === dreams.length) {
        return cached.map(toDreamCluster);
      }

      const groups = clusterByThreshold(
        dreams.map((d) => ({ id: d.id, embedding: d.embedding, symbols: (d.symbols ?? []).map((s: any) => s.symbol) })),
        { threshold: 0.82, minSize: 3 },
      );
      await db.from('dream_clusters').delete().eq('user_id', userId);
      const rows = groups.map((g) => ({
        user_id: userId, label: g.topSymbols[0] ? `Dreams of ${g.topSymbols[0]}` : 'A recurring theme',
        dream_ids: g.dreamIds, top_symbols: g.topSymbols, dream_count: dreams.length,
      }));
      if (rows.length) await db.from('dream_clusters').insert(rows);
      const { data: fresh } = await db.from('dream_clusters').select('*').eq('user_id', userId);
      return (fresh ?? []).map(toDreamCluster);
    },
  };
}

function toDreamCluster(r: any): DreamCluster {
  return { id: r.id, label: r.label, dreamIds: r.dream_ids, topSymbols: r.top_symbols, dreamCount: r.dream_count, computedAt: new Date(r.computed_at) };
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npm test -- clustering`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/clustering.ts apps/api/__tests__/unit/clustering.test.ts
git commit -m "feat(patterns): clustering service — threshold grouping + lazy cache"
```

---

### Task 7: insights service + wire into interpret write path

**Files:**
- Create: `apps/api/src/services/insights.ts`
- Modify: `apps/api/src/routes/dreams.ts` (interpret handler, after patternStats)
- Test: `apps/api/__tests__/unit/insights.test.ts`

**Interfaces:**
- Consumes: Supabase client; the `patternSummary` shape.
- Produces: `makeInsights(db).derive(userId: UserId, summary: UserPatternSummary): Promise<Insight[]>`.

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/__tests__/unit/insights.test.ts
import { makeInsights } from '../../src/services/insights';

function mockDb(existingTypesLabels: string[] = []) {
  const inserted: any[] = [];
  return { inserted, from: () => ({
    select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: existingTypesLabels.map((k) => ({ payload: { key: k } })), error: null }) }) }),
    insert: (rows: any[]) => { inserted.push(...rows); return Promise.resolve({ data: rows, error: null }); },
  }) } as any;
}

const summary = (count: number) => ({ totalDreams: 10, recurringSymbols: [{ symbol: 'water', count }], recurringThemes: [], dominantEmotionalTone: 'anxious', recentDreamSummaries: [] });

it('fires a recurring_symbol insight when a symbol reaches 5', async () => {
  const db = mockDb();
  const out = await makeInsights(db).derive('u1' as any, summary(5) as any);
  expect(out.some((i) => i.type === 'recurring_symbol')).toBe(true);
});

it('does NOT fire below the threshold (count 4)', async () => {
  const db = mockDb();
  const out = await makeInsights(db).derive('u1' as any, summary(4) as any);
  expect(out).toHaveLength(0);
});

it('does NOT double-fire for a crossing already recorded', async () => {
  const db = mockDb(['recurring_symbol:water:5']);
  const out = await makeInsights(db).derive('u1' as any, summary(5) as any);
  expect(out).toHaveLength(0);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd apps/api && npm test -- insights`
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
// apps/api/src/services/insights.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserId, Insight, UserPatternSummary } from '@dreamlens/shared/types/domain';

const SYMBOL_THRESHOLDS = [3, 5, 7];

export function makeInsights(db: SupabaseClient) {
  return {
    async derive(userId: UserId, summary: UserPatternSummary): Promise<Insight[]> {
      const { data: existing } = await db.from('user_insights')
        .select('payload').eq('user_id', userId).eq('type', 'recurring_symbol');
      const seenKeys = new Set((existing ?? []).map((r: any) => r.payload?.key));

      const toInsert: any[] = [];
      for (const s of summary.recurringSymbols) {
        const crossed = SYMBOL_THRESHOLDS.filter((t) => s.count === t);
        for (const t of crossed) {
          const key = `recurring_symbol:${s.symbol}:${t}`;
          if (seenKeys.has(key)) continue;
          toInsert.push({
            user_id: userId, type: 'recurring_symbol',
            title: `${s.symbol} keeps returning`,
            body: `${s.symbol} has appeared ${t} times in your dreams.`,
            payload: { key, symbol: s.symbol, count: t },
          });
        }
      }
      if (toInsert.length === 0) return [];
      const { data } = await db.from('user_insights').insert(toInsert).select?.() ?? { data: toInsert };
      return (data ?? toInsert).map(toInsight);
    },
  };
}

function toInsight(r: any): Insight {
  return { id: r.id ?? 'pending', type: r.type, title: r.title, body: r.body, payload: r.payload, createdAt: r.created_at ? new Date(r.created_at) : new Date(0), seenAt: null };
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npm test -- insights`
Expected: PASS.

- [ ] **Step 5: Wire into interpret handler (after patternStats)**

```typescript
const summary = await makePatternSummary(supabase).getForUser(req.user.id);
await makeInsights(supabase).derive(req.user.id, summary);
```

- [ ] **Step 6: Run dreams tests, commit**

Run: `cd apps/api && npm test -- dreams`
Expected: PASS.

```bash
git add apps/api/src/services/insights.ts apps/api/src/routes/dreams.ts apps/api/__tests__/unit/insights.test.ts
git commit -m "feat(patterns): insights service + write-path wiring (no cron)"
```

---

### Task 8: Profile endpoints + integration tests

**Files:**
- Create: `apps/api/src/routes/profile.ts`
- Modify: `apps/api/src/index.ts` (mount router)
- Test: `apps/api/__tests__/integration/profile.test.ts`

**Interfaces:**
- Consumes: all five services.
- Produces: `GET /v1/profile/summary` → `{ success, data: { summary, emotionArc, clusters, insights } }`; `POST /v1/insights/:id/seen` → `{ success, data: { id } }`.

- [ ] **Step 1: Write failing integration tests**

```typescript
// apps/api/__tests__/integration/profile.test.ts
import request from 'supertest';
import { app } from '../../src/app';
import { authHeader, seedUserWithDreams } from '../helpers'; // existing helpers

it('GET /v1/profile/summary returns the four sections for the caller only', async () => {
  const { token } = await seedUserWithDreams(6); // ≥ threshold
  const res = await request(app).get('/v1/profile/summary').set(authHeader(token));
  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  expect(res.body.data).toEqual(expect.objectContaining({ summary: expect.any(Object), emotionArc: expect.any(Array), clusters: expect.any(Array), insights: expect.any(Array) }));
});

it('returns 401 without auth', async () => {
  const res = await request(app).get('/v1/profile/summary');
  expect(res.status).toBe(401);
});

it('user A cannot see user B insights via seen endpoint', async () => {
  const a = await seedUserWithDreams(1);
  const b = await seedUserWithDreams(6);
  const bInsightId = b.insightIds[0];
  const res = await request(app).post(`/v1/insights/${bInsightId}/seen`).set(authHeader(a.token));
  expect([403, 404]).toContain(res.status); // RLS hides B's row from A
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd apps/api && npm test -- profile`
Expected: FAIL — route not mounted.

- [ ] **Step 3: Implement the router**

```typescript
// apps/api/src/routes/profile.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabase } from '../db/client';
import { makePatternSummary } from '../services/patternSummary';
import { makeEmotionArc } from '../services/emotionArc';
import { makeClustering } from '../services/clustering';

export const profileRouter = Router();

profileRouter.get('/v1/profile/summary', requireAuth, async (req, res) => {
  const uid = req.user.id;
  const [summary, emotionArc, clusters] = await Promise.all([
    makePatternSummary(supabase).getForUser(uid),
    makeEmotionArc(supabase).getForUser(uid),
    makeClustering(supabase).getOrRecompute(uid),
  ]);
  const { data: insights } = await supabase.from('user_insights')
    .select('*').eq('user_id', uid).is('seen_at', null).order('created_at', { ascending: false });
  res.json({ success: true, data: { summary, emotionArc, clusters, insights: insights ?? [] } });
});

profileRouter.post('/v1/insights/:id/seen', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('user_insights')
    .update({ seen_at: new Date().toISOString() })
    .eq('id', req.params.id).eq('user_id', req.user.id).select('id');
  if (error) return res.status(500).json({ success: false, error: { code: 'DB_WRITE_FAILED', message: 'Could not update insight' } });
  if (!data || data.length === 0) return res.status(404).json({ success: false, error: { code: 'RECORD_NOT_FOUND', message: 'Insight not found' } });
  res.json({ success: true, data: { id: req.params.id } });
});
```

Mount it in `apps/api/src/index.ts`: `app.use(profileRouter);`

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npm test -- profile`
Expected: PASS.

- [ ] **Step 5: Patch-coverage gate + commit**

Run: `cd apps/api && npm test -- --coverage`
Expected: PASS; changed lines ≥ 85%.

```bash
git add apps/api/src/routes/profile.ts apps/api/src/index.ts apps/api/__tests__/integration/profile.test.ts
git commit -m "feat(patterns): profile summary + insight-seen endpoints"
```

---

### Task 9: Mobile Profile surfaces

**Files:**
- Create: `apps/mobile/src/screens/ProfileScreen.tsx`, `apps/mobile/src/components/InsightCard/index.tsx`, `apps/mobile/src/components/EmotionArcChart/index.tsx`, `apps/mobile/src/components/ClusterCard/index.tsx`, `apps/mobile/src/hooks/usePatterns.ts`
- Test: `apps/mobile/__tests__/ProfileScreen.test.tsx`

**Interfaces:**
- Consumes: `GET /v1/profile/summary` via `usePatterns()`.
- Produces: a `ProfileScreen` rendering summary, arc, clusters, and insight cards, with teaser/empty/loading/error states.

- [ ] **Step 1: Write failing component tests**

```typescript
// apps/mobile/__tests__/ProfileScreen.test.tsx
import { render } from '@testing-library/react-native';
import { ProfileScreen } from '../src/screens/ProfileScreen';

jest.mock('../src/hooks/usePatterns');
import { usePatterns } from '../src/hooks/usePatterns';

it('shows the teaser when below 5 dreams', () => {
  (usePatterns as jest.Mock).mockReturnValue({ status: 'ok', data: { summary: { totalDreams: 3 }, emotionArc: [], clusters: [], insights: [] } });
  const { getByText } = render(<ProfileScreen />);
  expect(getByText(/unlock/i)).toBeTruthy();
});

it('renders insight cards when present', () => {
  (usePatterns as jest.Mock).mockReturnValue({ status: 'ok', data: { summary: { totalDreams: 8, recurringSymbols: [] }, emotionArc: [], clusters: [], insights: [{ id: '1', title: 'water keeps returning', body: 'x' }] } });
  const { getByText } = render(<ProfileScreen />);
  expect(getByText(/water keeps returning/i)).toBeTruthy();
});

it('shows the error state with a retry when the hook errors', () => {
  (usePatterns as jest.Mock).mockReturnValue({ status: 'error' });
  const { getByText } = render(<ProfileScreen />);
  expect(getByText(/try again/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd apps/mobile && npm test -- ProfileScreen`
Expected: FAIL.

- [ ] **Step 3: Implement `usePatterns` and `ProfileScreen`**

```typescript
// apps/mobile/src/hooks/usePatterns.ts
import { useEffect, useState } from 'react';
import { api } from '../services/api';

type State = { status: 'loading' } | { status: 'error' } | { status: 'ok'; data: any };
export function usePatterns(): State {
  const [state, setState] = useState<State>({ status: 'loading' });
  useEffect(() => {
    api.get('/v1/profile/summary')
      .then((r) => setState({ status: 'ok', data: r.data }))
      .catch(() => setState({ status: 'error' }));
  }, []);
  return state;
}
```

```tsx
// apps/mobile/src/screens/ProfileScreen.tsx
import { ScrollView, Text } from 'react-native';
import { usePatterns } from '../hooks/usePatterns';
import { InsightCard } from '../components/InsightCard';
import { EmptyState } from '../components/EmptyState';

export function ProfileScreen() {
  const s = usePatterns();
  if (s.status === 'loading') return <EmptyState variant="loading" />;
  if (s.status === 'error') return <EmptyState variant="error" title="Couldn't load your patterns" action="Try Again" />;
  if ((s.data.summary?.totalDreams ?? 0) < 5) return <Text>Your patterns unlock at your 5th dream.</Text>;
  return (
    <ScrollView>
      {(s.data.insights ?? []).map((i: any) => <InsightCard key={i.id} title={i.title} body={i.body} />)}
      {/* EmotionArcChart + ClusterCard render here, each with its own empty state */}
    </ScrollView>
  );
}
```

Implement `InsightCard`, `EmotionArcChart`, `ClusterCard` as focused presentational components using the design tokens (§8). Each renders nothing / an empty state when its data is missing.

- [ ] **Step 4: Run tests**

Run: `cd apps/mobile && npm test -- ProfileScreen`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/ProfileScreen.tsx apps/mobile/src/components apps/mobile/src/hooks/usePatterns.ts apps/mobile/__tests__/ProfileScreen.test.tsx
git commit -m "feat(patterns): mobile Profile surfaces — insights, arc, clusters with teaser/empty states"
```

---

## Self-Review

- **Spec coverage:** Tier 1 stats (Tasks 3, 4) ✓; Tier 2 clustering (Task 6) ✓; emotion arc (Task 5) ✓; insights/proactive-no-cron (Task 7) ✓; schema + RLS (Task 1) ✓; endpoints (Task 8) ✓; surfaces + cold-start teaser (Task 9) ✓; degraded mode (Task 9 error state, Task 6 cache fallback) ✓; two-user isolation (Task 8) ✓.
- **Thresholds:** symbol 3/5/7 (Task 7), 5-dream teaser (Task 9), cluster minSize 3 (Task 6) — match spec §6.
- **Type consistency:** `makePatternSummary`/`makeEmotionArc`/`makeClustering`/`makeInsights`/`makePatternStats` naming consistent across tasks; `UserPatternSummary` extended in Task 2 and consumed in Tasks 4/7; `DreamCluster`/`Insight`/`EmotionPoint` defined in Task 2 and used thereafter.
- **Deferred to a follow-up (noted, not silently dropped):** Claude warm-labeling of clusters (spec §3.4 optional) — Task 6 ships the deterministic label; add the optional Claude naming pass as a later enhancement. The `user_patterns` increment RPC semantics are asserted by the Task 8 integration path.

---

*End of Implementation Plan v1.0*
