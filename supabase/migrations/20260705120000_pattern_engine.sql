-- supabase/migrations/20260705120000_pattern_engine.sql

-- Generalize user_patterns to hold themes as well as symbols
ALTER TABLE user_patterns ADD COLUMN pattern_type TEXT NOT NULL DEFAULT 'symbol'
  CHECK (pattern_type IN ('symbol','theme'));
ALTER TABLE user_patterns RENAME COLUMN symbol TO label;
-- user_patterns_user_id_symbol_key is Postgres's default auto-generated name
-- for the inline `UNIQUE(user_id, symbol)` declared on user_patterns in
-- 20260705100000_initial_schema.sql (no explicit CONSTRAINT name was given
-- there, so Postgres named it `<table>_<columns>_key`). Verified against that
-- file before writing this DROP.
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

-- Task 3 (patternStats) needs to upsert occurrence counts for a batch of
-- pattern rows in one round trip. This RPC is deferred here from Task 3 per
-- the pattern-engine plan. SECURITY INVOKER so RLS on user_patterns still
-- applies to the calling user (no privilege escalation via the function).
CREATE OR REPLACE FUNCTION increment_user_patterns(p_rows jsonb)
RETURNS void
LANGUAGE sql VOLATILE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  INSERT INTO user_patterns (user_id, pattern_type, label, occurrence_count, last_seen)
  SELECT r.user_id, r.pattern_type, r.label, r.occurrence_count, r.last_seen
  FROM jsonb_to_recordset(p_rows) AS r(
    user_id UUID,
    pattern_type TEXT,
    label TEXT,
    occurrence_count INTEGER,
    last_seen TIMESTAMPTZ
  )
  ON CONFLICT (user_id, pattern_type, label) DO UPDATE
    SET occurrence_count = user_patterns.occurrence_count + 1,
        last_seen = EXCLUDED.last_seen;
$$;

-- Security hardening (final-review): pin the search_path of the pre-existing
-- match_dream_symbols RPC (from 20260705100100) as well. Both functions are
-- SECURITY INVOKER, but an unpinned search_path still allows object shadowing
-- by schemas earlier on the caller's path. Done here (not by editing the
-- earlier migration) because that migration may already be applied elsewhere.
ALTER FUNCTION match_dream_symbols(vector, int, float)
  SET search_path = public, pg_temp;
