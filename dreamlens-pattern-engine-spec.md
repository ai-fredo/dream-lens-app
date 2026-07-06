# DreamLens — Per-User Pattern Engine Spec
**Version:** 1.0
**Companion to:** dreamlens-prd.md, dreamlens-engineering-standards.md
**Status:** Approved design — ready for implementation plan
**Date:** July 2026

---

## 1. Summary

A **per-user pattern engine** that recognizes patterns in each user's own dream history and surfaces them as insights. Deterministic code computes the numbers (symbol/theme frequency, emotional arc, dream clusters); **Claude only narrates** those numbers into warm, non-prescriptive prose — it never counts.

This is **Tiers 1 + 2** of the pattern roadmap:
- **Tier 1 — Aggregate statistics:** symbol and theme frequency, emotional-tone-over-time.
- **Tier 2 — Embedding clustering:** grouping a user's own dreams by vector similarity to surface recurring themes that don't share the same words.

**Explicitly out of scope (YAGNI):** cross-user learning (Tier 3), any trained/custom ML model (Tier 4), GPU infrastructure, cron/worker services. Cross-user is a separate, later, opt-in project with its own consent and anonymization design.

### Non-negotiable framing
Everything operates **inside each user's existing RLS boundary**. No dream content crosses between users. This preserves the privacy posture the rest of the product commits to (RLS isolation, no dream content in logs, encryption at rest, GDPR/CCPA). The engine adds **no new cross-user privacy surface**.

---

## 2. Compute model (Option 1: incremental on write + lazy clustering)

| Trigger | What runs | Cost |
|---|---|---|
| **On interpretation (write)** | `patternStats.update` (upsert symbol/theme counts) → `insights.derive` (threshold checks) | ~a few ms; no new infra |
| **On interpretation (context)** | `patternSummary.getForUser` injected into Claude's RAG prompt (already in §7 of engineering standards, now richer) | negligible |
| **On Profile view** | `patternSummary` + `emotionArc` + `clustering.getOrRecompute` (lazy) + unseen `insights` | cheap; clustering only recomputes when new dreams exist since last run |

No scheduled job. Clustering recomputes lazily when the user opens their Profile *and* new dreams have accrued since the cached run — for tens-of-dreams-per-user this is trivial compute (threshold-grouping over cosine similarity; no k-means required). The "proactive" feel (insight cards) comes from the user's *own next dream* crossing a threshold at write time — no cron needed.

---

## 3. Components

Each unit has one purpose, a typed interface, and is independently testable.

### 3.1 `patternStats` (Tier 1)
- **Does:** on each interpretation, upsert per-user counts for every symbol AND theme in the result.
- **Interface:** `updateOnDream(userId, dream): Promise<void>`
- **Extends** the existing `user_patterns` `ON CONFLICT` increment to also cover themes (via `pattern_type`).

### 3.2 `patternSummary` (Tier 1)
- **Does:** compute a user's top recurring symbols/themes + dominant emotional tone + recent dream summaries.
- **Interface:** `getForUser(userId): Promise<UserPatternSummary>`
- **Consumers:** the RAG context builder (feeds Claude) and the Profile page.

### 3.3 `emotionArc` (Tier 1)
- **Does:** return a time series of `emotional_tone` by date for charting and streak detection.
- **Interface:** `getForUser(userId, sinceDays?): Promise<EmotionPoint[]>`
- Computed on the fly from `dreams`; no new table.

### 3.4 `clustering` (Tier 2)
- **Does:** group a user's own dreams by cosine similarity of their stored `embedding` vectors into labeled theme clusters.
- **Interface:** `getOrRecompute(userId): Promise<DreamCluster[]>`
- **Algorithm:** threshold-grouping — for each dream, find neighbors above a similarity threshold (pgvector), union-find into clusters; min cluster size 3. Label each cluster from its top symbols/themes (deterministic); optionally one cheap Claude call to name it warmly, with deterministic fallback.
- **Caching:** results stored in `dream_clusters`; recompute only when `dreams` count for the user exceeds the count at last `computed_at`.

### 3.5 `insights` (proactive, no cron)
- **Does:** at write time, detect threshold crossings and emit insight cards.
- **Interface:** `derive(userId, newDream): Promise<Insight[]>`
- **Triggers:** a symbol just reached 3× / 5× / 7×; a negative-emotional-tone streak (e.g. ≥2 weeks); a new cluster forming.
- Writes `user_insights` rows (with `seen_at` for mark-as-read). Idempotent — never double-fires for the same crossing.

### 3.6 Surfaces (consumers, not engine internals)
- **Dream Profile page** (already in PRD): top symbols/themes, emotional arc chart, cluster cards.
- **Insight cards:** e.g. "Water has surfaced 5 times — often when your dreams turn anxious."
- **`pattern_note`** in each interpretation (existing field): now backed by real computed data via `patternSummary`.

---

## 4. Data model changes

Three small changes; all new tables get the same `users_own_*` RLS policies as existing user tables (§4.1 of engineering standards).

```sql
-- 4.1 Generalize user_patterns to hold themes as well as symbols
ALTER TABLE user_patterns
  ADD COLUMN pattern_type TEXT NOT NULL DEFAULT 'symbol'
    CHECK (pattern_type IN ('symbol','theme'));
-- Re-key uniqueness on (user_id, pattern_type, label):
ALTER TABLE user_patterns RENAME COLUMN symbol TO label;
ALTER TABLE user_patterns DROP CONSTRAINT user_patterns_user_id_symbol_key;
ALTER TABLE user_patterns ADD CONSTRAINT user_patterns_user_type_label_key
  UNIQUE (user_id, pattern_type, label);

-- 4.2 Cached per-user dream clusters (Tier 2)
CREATE TABLE dream_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL,               -- deterministic or Claude-named
  dream_ids UUID[] NOT NULL,
  top_symbols TEXT[] NOT NULL DEFAULT '{}',
  dream_count INTEGER NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dream_clusters_user ON dream_clusters(user_id);

-- 4.3 Proactive insight cards
CREATE TABLE user_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                -- 'recurring_symbol' | 'emotion_streak' | 'new_cluster'
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  payload JSONB,                     -- structured data behind the card
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  seen_at TIMESTAMPTZ
);
CREATE INDEX idx_user_insights_unseen ON user_insights(user_id) WHERE seen_at IS NULL;

ALTER TABLE dream_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_clusters" ON dream_clusters FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users_own_insights" ON user_insights FOR ALL USING (auth.uid() = user_id);
```

### Types (add to packages/shared/types/domain.ts)
```typescript
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
```
`UserPatternSummary` already exists; extend it with `recurringThemes` alongside `recurringSymbols`.

---

## 5. Data flow

```
On POST /v1/dreams/:id/interpret (after Claude returns, §7 steps 7-8):
  patternStats.updateOnDream(userId, dream)   // upsert symbol + theme counts
  insights.derive(userId, dream)              // threshold checks -> user_insights rows

On GET /v1/dreams/:id/interpret context build (§7 step 3):
  patternSummary.getForUser(userId) -> injected into Claude prompt (richer pattern_note)

On GET /v1/profile/summary (Profile page):
  patternSummary.getForUser(userId)
  emotionArc.getForUser(userId)
  clustering.getOrRecompute(userId)           // lazy; recompute only if new dreams
  user_insights (unseen) for the cards
```

New/changed endpoints:
- `GET /v1/profile/summary` — returns `{ summary, emotionArc, clusters, insights }`.
- `POST /v1/insights/:id/seen` — mark an insight card read.

---

## 6. Cold-start thresholds

Never a blank screen — friendly teaser states below thresholds.

| Feature | Minimum | Behavior below |
|---|---|---|
| Any patterns | 5 dreams | Teaser: "Patterns unlock at your 5th dream" |
| Symbol "recurring" | 3 occurrences | Not flagged |
| Symbol surfaced proactively | 5 occurrences | Counted, not surfaced |
| Clusters | ~8-10 dreams; min 3 per cluster | No cluster cards |
| Emotion arc | ~7 entries | No chart |

(Thresholds match the PRD's existing pattern-detection language.)

---

## 7. Error handling & degraded mode

- **Clustering fails or errors:** Profile still renders stats + arc + insights. Clusters section shows an empty/retry state; never crashes.
- **Claude cluster-labeling fails:** fall back to deterministic label (top symbols joined), log error code only.
- **Sub-threshold data:** teaser states, never blank.
- **No dream content in logs** — same rule as the rest of the system; insights store structured payloads, not raw transcripts, in anything log-adjacent.

---

## 8. Testing (test-per-feature gate, §3 of engineering standards)

Each component ships with its suite in the same PR; patch coverage ≥ 85%.

- `patternStats`: increments symbol + theme correctly; handles null/empty symbol arrays; idempotent per dream.
- `patternSummary`: top-N by frequency; empty summary for a new user; themes + symbols both represented.
- `emotionArc`: correct series ordering; streak detection boundary (fires at the defined streak length, not before).
- `clustering`: groups similar vectors; respects min cluster size 3; deterministic given fixed input vectors; empty/`<threshold` input returns no clusters; recompute-skip when no new dreams.
- `insights`: fires at exactly 3/5/7; no double-fire on the same crossing; emotion-streak detection.
- **Isolation:** the two-user RLS test — user A never sees user B's patterns, clusters, or insights.
- Profile endpoint integration: returns the documented shape; 401 without auth.

---

## 9. Build order

1. Migration: `pattern_type` on `user_patterns`, `dream_clusters`, `user_insights` + RLS.
2. Shared types.
3. `patternStats` + tests → wire into the interpret write path. **Note:** the existing
   §7 Step 8 of the engineering standards inserts into `user_patterns(symbol, ...)`; update
   it to write `(label, pattern_type, ...)` after the 4.1 migration renames the column.
4. `patternSummary` + tests → wire into the RAG context builder (richer `pattern_note`).
5. `emotionArc` + tests.
6. `clustering` + tests → `getOrRecompute` caching.
7. `insights` + tests → wire into the interpret write path.
8. `GET /v1/profile/summary` + `POST /v1/insights/:id/seen` + integration tests.
9. Profile page surfaces (stats, arc chart, cluster cards, insight cards) + component tests.

---

*End of Per-User Pattern Engine Spec v1.0*
