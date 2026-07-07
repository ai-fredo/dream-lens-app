# Knowledge Base Seeding

This directory documents how to seed and embed the dream_symbols reference table from the Knowledge Vault export.

## Quick Start

Ensure migrations are applied first (or use `supabase db reset` to reset the entire database):

```bash
supabase migration up
```

Then run the seeder script with required environment variables:

```bash
SUPABASE_URL=<https://bsshtimzetovuvgqpvmq.supabase.co> \
SUPABASE_SERVICE_ROLE_KEY=<sb_publishable_-LC7J1vtM0xNNxn2jTcZUg_QRbenpSc> \
OPENAI_API_KEY=<your-openai-api-key> \
npx tsx files/seed-dream-symbols.ts files/dream_symbols.clean.jsonl
```

## Expected Output

A successful run produces:
```
Parsed 113 valid rows from files/dream_symbols.clean.jsonl
Upserted text rows.
113 rows need embeddings.
Embedded 100/113
Embedded 113/113
Done. dream_symbols is seeded and embedded.
```

## Prerequisites

- Supabase database migrations must be applied first (`supabase db reset` or `supabase migration up`).
- `SUPABASE_URL`: Your Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key (never ship in client apps).
- `OPENAI_API_KEY`: OpenAI API key for embeddings.

## Details

### Data Source

- **File:** `files/dream_symbols.clean.jsonl` (113 entries, one JSON object per line)
- **Validation:** Each row is validated for required fields (id, symbol, category, interpretation) and category against the canonical enum.

### Embedding Model

- **Model:** `text-embedding-3-small` (1536 dimensions)
- **Input:** Symbol + aliases + interpretation (aliases widen recall)
- **Batch size:** 100 rows per API call

### Idempotency

The seeder is safe to run repeatedly:

1. **Upsert on id:** Rows are upserted based on their id field (no duplicates).
2. **Content hash:** Each row's symbol, category, interpretation, aliases, and traditions are hashed (SHA-256).
3. **Smart re-embedding:** Only rows whose content_hash has changed (or is new) have their embedding reset to NULL and re-embedded. Unchanged rows keep their embedding and cost nothing.

### Pipeline Steps

1. **Parse & sanitize:** Read the JSONL file, sanitize wikilink references, validate required fields, and check category enum.
2. **Fetch existing hashes:** Query the database for rows with their current content_hash to detect changes.
3. **Upsert:** Insert or update rows with their text content and content_hash. If content changed, embedding is set to NULL.
4. **Embed nulls:** Query for all rows with embedding IS NULL, batch-embed them using OpenAI, and update the database.
5. **Done:** The dream_symbols table is now fully populated with non-null embeddings.

## Integration Tests

After seeding, verify the knowledge base is populated with:

```bash
cd apps/api
npm test -- kb_seed
```

This test:
- Confirms at least 113 rows are in the dream_symbols table.
- Confirms at least one row has a non-null embedding.
