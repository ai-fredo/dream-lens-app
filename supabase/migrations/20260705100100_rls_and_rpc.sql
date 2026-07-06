-- Migration: RLS policies + match_dream_symbols RPC.
-- RLS block copied verbatim from dreamlens-engineering-standards.md SECTION 6
-- (ROW LEVEL SECURITY, required). Table/column DDL (including aliases,
-- traditions, content_hash, and the category CHECK) already landed in
-- 20260705100000_initial_schema.sql (Task 2) — not duplicated here.

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE dreams ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE dream_symbols ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_profile" ON user_profiles
  FOR ALL USING (auth.uid() = id);

CREATE POLICY "users_own_dreams" ON dreams
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_patterns" ON user_patterns
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "dream_symbols_public_read" ON dream_symbols
  FOR SELECT USING (true);

-- match_dream_symbols RPC copied verbatim from
-- files/0002_dream_symbols_reference.sql (item 3). The column/CHECK parts of
-- that file are already in Task 2's migration and are intentionally not
-- repeated here.

-- 3) The similarity-search RPC the RAG pipeline calls (§7 Step 2) but was never defined.
--    Returns the top matches above a cosine-similarity threshold.
CREATE OR REPLACE FUNCTION match_dream_symbols(
  query_embedding vector(1536),
  match_count     int   DEFAULT 15,
  match_threshold float DEFAULT 0.7
)
RETURNS TABLE (
  id             uuid,
  symbol         text,
  category       text,
  interpretation text,
  source         text,
  similarity     float
)
LANGUAGE sql STABLE AS $$
  SELECT ds.id, ds.symbol, ds.category, ds.interpretation, ds.source,
         1 - (ds.embedding <=> query_embedding) AS similarity
  FROM dream_symbols ds
  WHERE ds.embedding IS NOT NULL
    AND 1 - (ds.embedding <=> query_embedding) > match_threshold
  ORDER BY ds.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- RLS: public read of the knowledge base is already covered by the
-- "dream_symbols_public_read" policy (§4.1). The RPC is STABLE and reads only
-- non-user data, so no additional policy is required.
