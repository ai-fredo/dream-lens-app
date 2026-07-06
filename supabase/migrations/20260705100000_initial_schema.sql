-- Migration 1: Enable extensions
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For text search

-- Migration 2: Core tables
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  timezone TEXT DEFAULT 'America/Los_Angeles',
  reminder_time TIME,
  reminder_enabled BOOLEAN DEFAULT false,
  subscription_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'pro', 'annual')),
  dream_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE dreams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL,
  raw_transcript TEXT NOT NULL CHECK (char_length(raw_transcript) <= 5000),
  edited_transcript TEXT CHECK (char_length(edited_transcript) <= 5000),
  interpretation JSONB,
  emotional_tone TEXT,
  symbols JSONB,
  themes TEXT[],
  needs_interpretation BOOLEAN NOT NULL DEFAULT false,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE dream_symbols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'jungian_archetype','scenario','environment','animal','object',
    'body','nature','color','relationship','somatic','freudian','cultural'
  )),
  interpretation TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'DreamLens Editorial',
  aliases TEXT[] NOT NULL DEFAULT '{}',      -- retrieval synonyms; folded into the embedding input
  traditions TEXT[] NOT NULL DEFAULT '{}',   -- which lens the entry draws on (transparency)
  content_hash TEXT,                          -- lets the seeder skip re-embedding unchanged rows
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- The knowledge base is authored in the DreamLens Knowledge Vault and exported to
-- dream_symbols.clean.jsonl. Load + embed it with files/seed-dream-symbols.ts
-- (see §9). The similarity-search RPC match_dream_symbols() is defined in
-- migration 0002 (files/0002_dream_symbols_reference.sql) — the RAG pipeline (§7) calls it.

CREATE TABLE user_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, symbol)
);

-- Indexes
CREATE INDEX idx_dreams_user_recorded ON dreams(user_id, recorded_at DESC);
CREATE INDEX idx_dreams_needs_interp ON dreams(user_id) WHERE needs_interpretation = true;
CREATE INDEX idx_dreams_embedding ON dreams
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_symbols_embedding ON dream_symbols
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX idx_patterns_user_count ON user_patterns(user_id, occurrence_count DESC);
CREATE INDEX idx_dreams_fts ON dreams
  USING gin(to_tsvector('english', coalesce(raw_transcript,'') || ' ' || coalesce(edited_transcript,'')));
