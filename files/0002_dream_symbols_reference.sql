-- Migration: reconcile the dream_symbols reference table with the Knowledge Vault export.
-- Goes in supabase/migrations/ (rename with a real YYYYMMDDHHMMSS prefix per §15).
-- Assumes 0001 already created dream_symbols (id, symbol, category, interpretation,
-- source, embedding VECTOR(1536), created_at) and enabled the `vector` extension.

-- 1) Columns the vault export carries that the app should keep.
--    aliases materially improve RAG retrieval (they widen the embedded text);
--    traditions is metadata for transparency ("which lens is this drawn from").
ALTER TABLE dream_symbols
  ADD COLUMN IF NOT EXISTS aliases      TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS traditions   TEXT[] NOT NULL DEFAULT '{}',
  -- content_hash lets the loader skip re-embedding unchanged rows (embeddings cost money).
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- 2) Canonical category taxonomy. This is the single source of truth for the enum;
--    it must match SymbolCategory in packages/shared/types/domain.ts.
--    (Reconciles the prior mismatch: the type omitted object/body/nature, which the
--    vault actually uses.)
ALTER TABLE dream_symbols DROP CONSTRAINT IF EXISTS dream_symbols_category_check;
ALTER TABLE dream_symbols
  ADD CONSTRAINT dream_symbols_category_check CHECK (category IN (
    'jungian_archetype','scenario','environment','animal','object',
    'body','nature','color','relationship','somatic','freudian','cultural'
  ));

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
