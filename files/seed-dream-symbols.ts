/**
 * Seed + embed the dream_symbols reference table from the Knowledge Vault export.
 *
 * Pipeline (idempotent, safe to re-run):
 *   1. Read dream_symbols.clean.jsonl (the vault export, wikilinks already flattened).
 *   2. Defensively sanitize each row (strip any stray [[wikilinks]] and control chars).
 *   3. Validate required fields + category against the canonical enum.
 *   4. Upsert on `id`. If the content changed (content_hash differs), NULL the embedding
 *      so it gets regenerated; unchanged rows keep their embedding and cost nothing.
 *   5. Embed every row whose embedding IS NULL, using
 *      symbol + aliases + interpretation as the embedding input (aliases widen recall).
 *
 * Run:  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... OPENAI_API_KEY=... \
 *       npx tsx files/seed-dream-symbols.ts files/dream_symbols.clean.jsonl
 *
 * Uses the service_role key (server-side only — never ship this to the app).
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const CATEGORIES = new Set([
  'jungian_archetype', 'scenario', 'environment', 'animal', 'object',
  'body', 'nature', 'color', 'relationship', 'somatic', 'freudian', 'cultural',
]);

const EMBEDDING_MODEL = 'text-embedding-3-small'; // 1536 dims — matches VECTOR(1536)
const EMBED_BATCH = 100;

interface SymbolRow {
  id: string;
  symbol: string;
  category: string;
  interpretation: string;
  source: string;
  aliases: string[];
  traditions: string[];
}

function sanitize(text: string): string {
  return text
    // [[Path/Note|Display]] -> Display ; [[Path/Note]] -> last path segment
    .replace(/\[\[([^\]]+)\]\]/g, (_m, inner: string) =>
      inner.includes('|') ? inner.split('|').slice(1).join('|') : inner.split('/').pop()!)
    .replace(/[\u0000-\u001f]/g, ' ') // strip control chars
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function embeddingInput(r: SymbolRow): string {
  const aliasLine = r.aliases.length ? `Also known as: ${r.aliases.join(', ')}.` : '';
  return `${r.symbol}. ${aliasLine} ${r.interpretation}`.trim();
}

function hashRow(r: SymbolRow): string {
  return createHash('sha256')
    .update(JSON.stringify([r.symbol, r.category, r.interpretation, r.aliases, r.traditions]))
    .digest('hex');
}

function parseAndValidate(path: string): SymbolRow[] {
  const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim());
  const seen = new Set<string>();
  return lines.map((line, i) => {
    const o = JSON.parse(line);
    for (const f of ['id', 'symbol', 'category', 'interpretation'] as const) {
      if (!o[f]) throw new Error(`line ${i + 1}: missing required field "${f}"`);
    }
    if (!CATEGORIES.has(o.category)) {
      throw new Error(`line ${i + 1}: category "${o.category}" not in canonical enum`);
    }
    if (seen.has(o.id)) throw new Error(`line ${i + 1}: duplicate id ${o.id}`);
    seen.add(o.id);
    return {
      id: o.id,
      symbol: o.symbol,
      category: o.category,
      interpretation: sanitize(o.interpretation),
      source: o.source ?? 'DreamLens Editorial',
      aliases: Array.isArray(o.aliases) ? o.aliases : [],
      traditions: Array.isArray(o.traditions) ? o.traditions : [],
    };
  });
}

async function main() {
  const path = process.argv[2] ?? 'files/dream_symbols.clean.jsonl';
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
    throw new Error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY');
  }
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  const rows = parseAndValidate(path);
  console.log(`Parsed ${rows.length} valid rows from ${path}`);

  // Fetch existing hashes so we only reset embeddings for changed content.
  const { data: existing } = await db.from('dream_symbols').select('id, content_hash');
  const prevHash = new Map((existing ?? []).map((r) => [r.id, r.content_hash]));

  const upserts = rows.map((r) => {
    const hash = hashRow(r);
    const changed = prevHash.get(r.id) !== hash;
    return {
      id: r.id, symbol: r.symbol, category: r.category, interpretation: r.interpretation,
      source: r.source, aliases: r.aliases, traditions: r.traditions, content_hash: hash,
      ...(changed ? { embedding: null } : {}), // force re-embed only when content changed
    };
  });

  const { error: upErr } = await db.from('dream_symbols').upsert(upserts, { onConflict: 'id' });
  if (upErr) throw new Error(`Upsert failed: ${upErr.message}`);
  console.log('Upserted text rows.');

  // Embed everything still missing an embedding (new or changed rows).
  const { data: toEmbed, error: selErr } = await db
    .from('dream_symbols')
    .select('id, symbol, interpretation, aliases')
    .is('embedding', null);
  if (selErr) throw new Error(`Select failed: ${selErr.message}`);
  console.log(`${toEmbed?.length ?? 0} rows need embeddings.`);

  for (let i = 0; i < (toEmbed?.length ?? 0); i += EMBED_BATCH) {
    const batch = toEmbed!.slice(i, i + EMBED_BATCH) as unknown as SymbolRow[];
    const res = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch.map(embeddingInput),
    });
    await Promise.all(
      batch.map((r, j) =>
        db.from('dream_symbols').update({ embedding: res.data[j]!.embedding }).eq('id', r.id),
      ),
    );
    console.log(`Embedded ${Math.min(i + EMBED_BATCH, toEmbed!.length)}/${toEmbed!.length}`);
  }
  console.log('Done. dream_symbols is seeded and embedded.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
