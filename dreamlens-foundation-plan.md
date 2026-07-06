# Phase 0/1 Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the DreamLens backend foundation — TypeScript monorepo, Supabase schema + RLS, the seeded 113-entry knowledge base, and the full `/v1` dream API (CRUD + RAG-powered Claude interpretation) — so the per-user pattern engine (separate plan) can be built on top.

**Architecture:** pnpm/npm monorepo (`apps/api`, `apps/mobile`, `packages/shared`). Express + TypeScript API on Supabase (Postgres + pgvector). Interpretation = RAG (OpenAI embed → pgvector `match_dream_symbols` → Claude Sonnet 4.6) with typed fallbacks. Every table under RLS; every route under `/v1`.

**Tech Stack:** TypeScript (strict), Express, `@supabase/supabase-js`, `@anthropic-ai/sdk` (model `claude-sonnet-4-6`), `openai` (`text-embedding-3-small`), Zod, `express-rate-limit`, `helmet`, `cors`, Winston, Sentry, Jest + ts-jest + supertest.

## Global Constraints

- TypeScript strict mode everywhere; no `any` without a justifying comment. (§1)
- Claude model id is exactly `claude-sonnet-4-6`. Embeddings model is `text-embedding-3-small` (1536 dims). (§ standards / PRD)
- Every user-data table: `ENABLE ROW LEVEL SECURITY` + `users_own_*` policy `USING (auth.uid() = user_id)`. `dream_symbols` is public-read only. (§4.1)
- Every request body validated with Zod; every response is `{ success:true, data }` or `{ success:false, error:{ code, message, details? } }`. (§4.3, §16)
- All routes under `/v1/`. Status codes per §16 (201 create, 400 validation, 401 unauth, 403 wrong-user, 404, 409 conflict, 429 rate-limited, 503 external-down).
- No dream content (transcripts, interpretation text) in logs; hash user ids. (§4.5)
- Secrets only from env; `.env` git-ignored; service_role key never in mobile. (§13)
- Services take their Supabase/OpenAI/Anthropic clients as injected params so tests mock them — no singletons imported inside service bodies.
- Test-per-feature gate: each task ships its suite; patch coverage ≥ 85% on changed lines. (§3)
- Transcript length cap: 5000 chars (10 min for demo: 1000 chars). (§4.3)

## File Structure

```
apps/api/src/
  app.ts               # express app (exported for supertest)
  index.ts             # server bootstrap + Sentry
  db/client.ts         # supabase singletons (service + anon)
  middleware/{auth,validate,rateLimit,logger}.ts
  routes/{dreams,account,demo,health}.ts
  services/{embeddings,rag,claude,retry}.ts
  validation/schemas.ts
packages/shared/types/{domain,errors}.ts
supabase/migrations/*.sql
supabase/seed/  (uses files/dream_symbols.clean.jsonl + files/seed-dream-symbols.ts)
```

---

### Task 1: Monorepo scaffold + strict TypeScript + shared types

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `apps/api/package.json`, `apps/api/tsconfig.json`, `packages/shared/types/domain.ts`, `packages/shared/types/errors.ts`
- Test: `apps/api/__tests__/unit/types.test.ts`

**Interfaces:**
- Produces: workspace with `@dreamlens/shared`; `DreamEntry`, `DreamInterpretation`, `DreamSymbol`, `SymbolCategory`, `UserPatternSummary`, `ApiResult`, `DreamLensError`, `ErrorCode` (copy verbatim from engineering-standards §1 and §4 — including the canonical `SymbolCategory` list: `jungian_archetype | scenario | environment | animal | object | body | nature | color | relationship | somatic | freudian | cultural`).

- [ ] **Step 1: Create the workspace root**

```json
// package.json
{ "name": "dreamlens", "private": true, "workspaces": ["apps/*", "packages/*"] }
```

```json
// tsconfig.base.json
{ "compilerOptions": {
  "strict": true, "noUncheckedIndexedAccess": true, "exactOptionalPropertyTypes": true,
  "noImplicitReturns": true, "noFallthroughCasesInSwitch": true,
  "module": "commonjs", "target": "es2022", "esModuleInterop": true, "skipLibCheck": true,
  "baseUrl": ".", "paths": { "@dreamlens/shared/*": ["packages/shared/*"] } } }
```

- [ ] **Step 2: Add the shared types**

Copy the type definitions from engineering-standards §1 into `packages/shared/types/domain.ts` and the error taxonomy from §5 into `packages/shared/types/errors.ts`. Use the canonical `SymbolCategory` union above.

- [ ] **Step 3: Write a type-usage test**

```typescript
// apps/api/__tests__/unit/types.test.ts
import type { DreamInterpretation, SymbolCategory } from '@dreamlens/shared/types/domain';
import { DreamLensError } from '@dreamlens/shared/types/errors';
it('domain types + error class are importable and shaped correctly', () => {
  const cat: SymbolCategory = 'object';
  const err = new DreamLensError('VALIDATION_ERROR', 'bad');
  const i: DreamInterpretation = { summary: 's', themes: [], symbols: [], emotionalTone: 'calm', patternNote: null, questionsToReflectOn: [], generatedAt: new Date(), modelVersion: 'claude-sonnet-4-6' };
  expect([cat, err.code, i.modelVersion]).toBeDefined();
});
```

- [ ] **Step 4: Install + typecheck + test**

Run: `npm install && cd apps/api && npm run typecheck && npm test -- types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.base.json apps packages
git commit -m "chore: monorepo scaffold + strict TS + shared domain types"
```

---

### Task 2: Initial Supabase schema

**Files:**
- Create: `supabase/migrations/20260705100000_initial_schema.sql`
- Test: `apps/api/__tests__/integration/schema.test.ts`

**Interfaces:**
- Produces: tables `user_profiles`, `dreams`, `dream_symbols`, `user_patterns`; extensions `vector`, `pg_trgm`; indexes per §15.

- [ ] **Step 1: Write the migration**

Use the exact DDL from engineering-standards §5 (Section 5: Database Schema) for `user_profiles`, `dreams`, `dream_symbols` (including the category `CHECK` and the `aliases`/`traditions`/`content_hash` columns), `user_patterns`, plus the extensions and all indexes (`idx_dreams_user_recorded`, the two ivfflat embedding indexes, `idx_patterns_user_count`, `idx_dreams_fts`). Copy verbatim; do not paraphrase.

- [ ] **Step 2: Apply locally**

Run: `supabase start && supabase db reset`
Expected: applies cleanly.

- [ ] **Step 3: Write a schema smoke test**

```typescript
// apps/api/__tests__/integration/schema.test.ts
import { testDb } from '../helpers/testDb';
it.each(['user_profiles','dreams','dream_symbols','user_patterns'])('table %s exists', async (t) => {
  expect((await testDb.from(t).select('*').limit(0)).error).toBeNull();
});
```

- [ ] **Step 4: Run + commit**

Run: `cd apps/api && npm test -- schema` → PASS.
```bash
git add supabase/migrations/20260705100000_initial_schema.sql apps/api/__tests__/integration/schema.test.ts
git commit -m "feat(db): initial schema — profiles, dreams, dream_symbols, user_patterns"
```

---

### Task 3: RLS policies + match_dream_symbols RPC

**Files:**
- Create: `supabase/migrations/20260705100100_rls_and_rpc.sql`
- Test: `apps/api/__tests__/integration/rls.test.ts`

**Interfaces:**
- Produces: RLS policies for all user tables; public-read for `dream_symbols`; `match_dream_symbols(query_embedding, match_count, match_threshold)`.

- [ ] **Step 1: Write the migration**

Copy the RLS block from engineering-standards §6 and the `match_dream_symbols` function from `files/0002_dream_symbols_reference.sql` (also fold in the `aliases`/`traditions`/`content_hash` columns + category CHECK from that file if Task 2 didn't already include them).

- [ ] **Step 2: Apply + write the two-user isolation test**

```typescript
// apps/api/__tests__/integration/rls.test.ts
import { clientFor, seedUser } from '../helpers'; // creates a user + returns an auth-scoped client
it('user A cannot read user B dreams even with a valid token', async () => {
  const a = await seedUser(); const b = await seedUser();
  await b.client.from('dreams').insert({ user_id: b.id, recorded_at: new Date().toISOString(), raw_transcript: 'x'.repeat(20) });
  const { data } = await a.client.from('dreams').select('*');
  expect(data?.every((d) => d.user_id === a.id)).toBe(true);
});
```

- [ ] **Step 3: Run + commit**

Run: `cd apps/api && npm test -- rls` → PASS.
```bash
git add supabase/migrations/20260705100100_rls_and_rpc.sql apps/api/__tests__/integration/rls.test.ts
git commit -m "feat(db): RLS policies + match_dream_symbols RPC"
```

---

### Task 4: Seed + embed the knowledge base

**Files:**
- Reuse: `files/dream_symbols.clean.jsonl` (113 entries), `files/seed-dream-symbols.ts`
- Create: `supabase/seed/README.md` (documents the command)
- Test: `apps/api/__tests__/integration/kb_seed.test.ts`

**Interfaces:**
- Produces: a populated `dream_symbols` table with non-null embeddings.

- [ ] **Step 1: Run the seeder against local Supabase**

Run: `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... OPENAI_API_KEY=... npx tsx files/seed-dream-symbols.ts files/dream_symbols.clean.jsonl`
Expected: "Parsed 113 valid rows", "113 rows need embeddings", "Done."

- [ ] **Step 2: Write a verification test**

```typescript
// apps/api/__tests__/integration/kb_seed.test.ts
import { testDb } from '../helpers/testDb';
it('knowledge base is seeded and embedded', async () => {
  const { count } = await testDb.from('dream_symbols').select('*', { count: 'exact', head: true });
  expect(count).toBeGreaterThanOrEqual(113);
  const { data } = await testDb.from('dream_symbols').select('embedding').not('embedding', 'is', null).limit(1);
  expect(data?.length).toBe(1);
});
```

- [ ] **Step 3: Run + commit**

Run: `cd apps/api && npm test -- kb_seed` → PASS.
```bash
git add supabase/seed/README.md apps/api/__tests__/integration/kb_seed.test.ts
git commit -m "feat(db): seed + embed the 113-entry knowledge base"
```

---

### Task 5: Express app + health endpoint + error envelope + logging

**Files:**
- Create: `apps/api/src/app.ts`, `apps/api/src/index.ts`, `apps/api/src/routes/health.ts`, `apps/api/src/middleware/logger.ts`, `apps/api/src/db/client.ts`
- Test: `apps/api/__tests__/integration/health.test.ts`

**Interfaces:**
- Produces: an exported `app` (for supertest); `GET /v1/health`; `helmet` + `cors` allowlist; JSON error envelope; hashed-user-id logger.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/__tests__/integration/health.test.ts
import request from 'supertest';
import { app } from '../../src/app';
it('GET /v1/health returns 200 ok', async () => {
  const res = await request(app).get('/v1/health');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ success: true, data: { status: 'ok' } });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd apps/api && npm test -- health` → FAIL (no app).

- [ ] **Step 3: Implement app + health**

```typescript
// apps/api/src/app.ts
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { healthRouter } from './routes/health';

export const app = express();
app.use(helmet());
app.use(cors({ origin: (process.env.CORS_ALLOWLIST ?? '').split(',').filter(Boolean) }));
app.use(express.json({ limit: '256kb' }));
app.use(healthRouter);
// central error envelope
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(err.status ?? 500).json({ success: false, error: { code: err.code ?? 'INTERNAL', message: 'Something went wrong' } });
});
```

```typescript
// apps/api/src/routes/health.ts
import { Router } from 'express';
export const healthRouter = Router();
healthRouter.get('/v1/health', (_req, res) => res.json({ success: true, data: { status: 'ok' } }));
```

Implement `db/client.ts` (anon + service_role Supabase clients from env) and `middleware/logger.ts` (Winston JSON lines with `hashUserId` per §4.5). `index.ts` initializes Sentry (`beforeSend` scrubs `transcript`/`interpretation`) and calls `app.listen`.

- [ ] **Step 4: Run + commit**

Run: `cd apps/api && npm test -- health` → PASS.
```bash
git add apps/api/src/app.ts apps/api/src/index.ts apps/api/src/routes/health.ts apps/api/src/middleware/logger.ts apps/api/src/db/client.ts apps/api/__tests__/integration/health.test.ts
git commit -m "feat(api): express app, health endpoint, error envelope, structured logging"
```

---

### Task 6: Auth middleware

**Files:**
- Create: `apps/api/src/middleware/auth.ts`
- Test: `apps/api/__tests__/unit/auth.test.ts`

**Interfaces:**
- Produces: `requireAuth(req, res, next)` that verifies the Supabase JWT and sets `req.user = { id: UserId }`; 401 on missing/invalid token.

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/__tests__/unit/auth.test.ts
import { makeRequireAuth } from '../../src/middleware/auth';
const res = () => { const r: any = {}; r.status = (c: number) => { r.code = c; return r; }; r.json = (b: any) => { r.body = b; return r; }; return r; };

it('401 when no Authorization header', async () => {
  const r = res(); let called = false;
  await makeRequireAuth({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } } as any)({ headers: {} } as any, r, () => { called = true; });
  expect(r.code).toBe(401); expect(called).toBe(false);
});
it('sets req.user and calls next on a valid token', async () => {
  const r = res(); const req: any = { headers: { authorization: 'Bearer good' } }; let called = false;
  await makeRequireAuth({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) } } as any)(req, r, () => { called = true; });
  expect(called).toBe(true); expect(req.user.id).toBe('u1');
});
```

- [ ] **Step 2: Run to confirm failure** → `cd apps/api && npm test -- auth` → FAIL.

- [ ] **Step 3: Implement**

```typescript
// apps/api/src/middleware/auth.ts
import type { Request, Response, NextFunction } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserId } from '@dreamlens/shared/types/domain';

export function makeRequireAuth(supabase: SupabaseClient) {
  return async function requireAuth(req: Request, res: Response, next: NextFunction) {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    const { data, error } = await supabase.auth.getUser(h.slice(7));
    if (error || !data.user) return res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } });
    (req as any).user = { id: data.user.id as UserId };
    next();
  };
}
```

- [ ] **Step 4: Run + commit** → PASS.
```bash
git add apps/api/src/middleware/auth.ts apps/api/__tests__/unit/auth.test.ts
git commit -m "feat(api): Supabase JWT auth middleware"
```

---

### Task 7: Zod validation + rate limiting middleware

**Files:**
- Create: `apps/api/src/validation/schemas.ts`, `apps/api/src/middleware/rateLimit.ts`
- Test: `apps/api/__tests__/unit/validate.test.ts`

**Interfaces:**
- Produces: `validate(schema)` middleware; `CreateDreamSchema`, `UpdateTranscriptSchema`, `DemoInterpretSchema`; `generalLimiter`, `interpretLimiter`, `demoLimiter`.

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/__tests__/unit/validate.test.ts
import { validate } from '../../src/validation/schemas';
import { CreateDreamSchema } from '../../src/validation/schemas';
const res = () => { const r: any = {}; r.status = (c: number) => { r.code = c; return r; }; r.json = (b: any) => { r.body = b; return r; }; return r; };

it('400 with field errors when transcript too short', () => {
  const r = res(); let called = false;
  validate(CreateDreamSchema)({ body: { rawTranscript: 'hi', recordedAt: new Date().toISOString() } } as any, r, () => { called = true; });
  expect(r.code).toBe(400); expect(called).toBe(false); expect(r.body.error.code).toBe('VALIDATION_ERROR');
});
it('passes and replaces body with parsed data when valid', () => {
  const r = res(); const req: any = { body: { rawTranscript: 'x'.repeat(20), recordedAt: new Date().toISOString() } }; let called = false;
  validate(CreateDreamSchema)(req, r, () => { called = true; });
  expect(called).toBe(true);
});
```

- [ ] **Step 2: Run to confirm failure** → FAIL.

- [ ] **Step 3: Implement**

Copy the Zod schemas and `validate` factory from engineering-standards §4.3, and the three limiters from §4.2 (`generalLimiter` 100/15min, `interpretLimiter` 5/min keyed by user id, `demoLimiter` 3/hour). Ensure `validate` returns `{ success:false, error:{ code:'VALIDATION_ERROR', ... details } }`.

- [ ] **Step 4: Run + commit** → PASS.
```bash
git add apps/api/src/validation/schemas.ts apps/api/src/middleware/rateLimit.ts apps/api/__tests__/unit/validate.test.ts
git commit -m "feat(api): Zod validation + rate limiting middleware"
```

---

### Task 8: Dreams CRUD (create, list, get, edit)

**Files:**
- Create: `apps/api/src/routes/dreams.ts`
- Modify: `apps/api/src/app.ts` (mount router + limiters)
- Test: `apps/api/__tests__/integration/dreams.test.ts`

**Interfaces:**
- Produces: `POST /v1/dreams` (201), `GET /v1/dreams` (paginated), `GET /v1/dreams/:id`, `PUT /v1/dreams/:id` (transcript edit). Enforces the free-tier gate (402 at ≥10 for `free`).

- [ ] **Step 1: Write failing integration tests**

```typescript
// apps/api/__tests__/integration/dreams.test.ts
import request from 'supertest';
import { app } from '../../src/app';
import { authHeader, seedUser } from '../helpers';

it('POST /v1/dreams creates and returns 201', async () => {
  const u = await seedUser();
  const res = await request(app).post('/v1/dreams').set(authHeader(u.token))
    .send({ rawTranscript: 'x'.repeat(20), recordedAt: new Date().toISOString() });
  expect(res.status).toBe(201);
  expect(res.body.data.id).toBeDefined();
});
it('401 without auth', async () => {
  expect((await request(app).post('/v1/dreams').send({})).status).toBe(401);
});
it('400 when transcript exceeds 5000 chars', async () => {
  const u = await seedUser();
  const res = await request(app).post('/v1/dreams').set(authHeader(u.token))
    .send({ rawTranscript: 'x'.repeat(5001), recordedAt: new Date().toISOString() });
  expect(res.status).toBe(400);
});
it('404 GET of another user dream', async () => {
  const a = await seedUser(); const b = await seedUser();
  const created = await request(app).post('/v1/dreams').set(authHeader(b.token)).send({ rawTranscript: 'x'.repeat(20), recordedAt: new Date().toISOString() });
  const res = await request(app).get(`/v1/dreams/${created.body.data.id}`).set(authHeader(a.token));
  expect(res.status).toBe(404);
});
```

- [ ] **Step 2: Run to confirm failure** → FAIL.

- [ ] **Step 3: Implement the router**

Implement `dreams.ts` with `makeRequireAuth`, `validate(CreateDreamSchema/UpdateTranscriptSchema)`, and `generalLimiter`. Each handler queries via a **request-scoped Supabase client carrying the caller's JWT** so RLS enforces ownership (a wrong-user fetch returns no rows → 404). `POST` checks `user_profiles.dream_count`/`subscription_tier` and returns 402 `UPGRADE_REQUIRED` at ≥10 for free users (§14), else inserts and increments. All responses use the `{ success, data }` envelope.

- [ ] **Step 4: Run + commit** → PASS.
```bash
git add apps/api/src/routes/dreams.ts apps/api/src/app.ts apps/api/__tests__/integration/dreams.test.ts
git commit -m "feat(api): dreams CRUD with RLS-enforced ownership + free-tier gate"
```

---

### Task 9: Embeddings + RAG context services

**Files:**
- Create: `apps/api/src/services/embeddings.ts`, `apps/api/src/services/rag.ts`, `apps/api/src/services/retry.ts`
- Test: `apps/api/__tests__/unit/rag.test.ts`

**Interfaces:**
- Produces: `makeEmbeddings(openai).embed(text): Promise<number[]>`; `makeRag(db, openai).buildContext(userId, transcript): Promise<{ symbolContext:string; patternContext:string; embedding:number[]|null }>`; `withRetry(fn, opts)`.

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/__tests__/unit/rag.test.ts
import { makeRag } from '../../src/services/rag';

const openaiOk = { embeddings: { create: async () => ({ data: [{ embedding: new Array(1536).fill(0.01) }] }) } } as any;
const openaiFail = { embeddings: { create: async () => { throw new Error('down'); } } } as any;
const dbWith = (symbols: any[]) => ({ rpc: async () => ({ data: symbols, error: null }), from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }) } as any;

it('builds symbol context from matched symbols', async () => {
  const rag = makeRag(dbWith([{ symbol: 'water', interpretation: 'flow', category: 'environment' }]), openaiOk);
  const ctx = await rag.buildContext('u1' as any, 'I dreamed of water');
  expect(ctx.symbolContext).toContain('water');
  expect(ctx.embedding).toHaveLength(1536);
});
it('degrades gracefully when embedding fails (skips RAG, no throw)', async () => {
  const rag = makeRag(dbWith([]), openaiFail);
  const ctx = await rag.buildContext('u1' as any, 'x');
  expect(ctx.embedding).toBeNull();
  expect(ctx.symbolContext).toBe('');
});
```

- [ ] **Step 2: Run to confirm failure** → FAIL.

- [ ] **Step 3: Implement**

Implement `embeddings.ts` (calls `openai.embeddings.create({ model: 'text-embedding-3-small', input })`, returns `data[0].embedding`). Implement `rag.ts.buildContext` following engineering-standards §7 Steps 1-4: try embed (on failure set `embedding=null`, `symbolContext=''` — degraded), else `db.rpc('match_dream_symbols', { query_embedding, match_count: 15, match_threshold: 0.7 })`, format `symbolContext`, and build `patternContext` from the user's `user_patterns` (top 5). `retry.ts` = the `withRetry` helper from §5.

- [ ] **Step 4: Run + commit** → PASS.
```bash
git add apps/api/src/services/embeddings.ts apps/api/src/services/rag.ts apps/api/src/services/retry.ts apps/api/__tests__/unit/rag.test.ts
git commit -m "feat(api): embeddings + RAG context services with degraded mode"
```

---

### Task 10: Claude interpretation service

**Files:**
- Create: `apps/api/src/services/claude.ts`
- Test: `apps/api/__tests__/unit/claude.test.ts`

**Interfaces:**
- Produces: `makeClaude(anthropic).interpret({ transcript, symbolContext, patternContext }): Promise<DreamInterpretation>` with a safe-default fallback on malformed/missing JSON.

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/__tests__/unit/claude.test.ts
import { makeClaude } from '../../src/services/claude';
const reply = (text: string) => ({ messages: { create: async () => ({ content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 10 } }) } } as any);

it('parses a valid JSON interpretation', async () => {
  const good = JSON.stringify({ summary: 's', themes: ['t'], symbols: [{ symbol: 'water', interpretation: 'x' }], emotionalTone: 'calm', patternNote: null, questionsToReflectOn: ['q'] });
  const out = await makeClaude(reply(good)).interpret({ transcript: 'd', symbolContext: '', patternContext: '' });
  expect(out.summary).toBe('s'); expect(out.modelVersion).toBe('claude-sonnet-4-6');
});
it('returns the safe default when Claude returns malformed JSON', async () => {
  const out = await makeClaude(reply('not json')).interpret({ transcript: 'd', symbolContext: '', patternContext: '' });
  expect(out.emotionalTone).toBe('contemplative'); // safe default
  expect(out.symbols).toEqual([]);
});
```

- [ ] **Step 2: Run to confirm failure** → FAIL.

- [ ] **Step 3: Implement**

Implement `claude.ts`: build the system prompt from engineering-standards §7a with `symbolContext`/`patternContext`/`transcript` interpolated; call `anthropic.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 1000, temperature: 0, system, messages: [{ role: 'user', content: transcript }] })`; `JSON.parse` the text (stripping ```` ```json ```` fences); validate all required fields, and on any failure return the §7b safe default with `emotionalTone: 'contemplative'`. Always stamp `generatedAt` and `modelVersion: 'claude-sonnet-4-6'`.

- [ ] **Step 4: Run + commit** → PASS.
```bash
git add apps/api/src/services/claude.ts apps/api/__tests__/unit/claude.test.ts
git commit -m "feat(api): Claude interpretation service with safe-default fallback"
```

---

### Task 11: Interpret endpoint (RAG + Claude + persist)

**Files:**
- Modify: `apps/api/src/routes/dreams.ts`
- Test: `apps/api/__tests__/integration/interpret.test.ts`

**Interfaces:**
- Produces: `POST /v1/dreams/:id/interpret` → 200 with interpretation; 409 if already interpreted; 503 if Claude is down (transcript saved, `needs_interpretation=true`); rate-limited by `interpretLimiter`.

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/__tests__/integration/interpret.test.ts
import request from 'supertest';
import { app } from '../../src/app';
import { authHeader, seedUser, createDream } from '../helpers'; // helpers may inject mock clients
it('200 with interpretation on success', async () => {
  const u = await seedUser(); const id = await createDream(u.token);
  const res = await request(app).post(`/v1/dreams/${id}/interpret`).set(authHeader(u.token));
  expect(res.status).toBe(200);
  expect(res.body.data.summary).toBeDefined();
});
it('409 when already interpreted', async () => {
  const u = await seedUser(); const id = await createDream(u.token);
  await request(app).post(`/v1/dreams/${id}/interpret`).set(authHeader(u.token));
  const res = await request(app).post(`/v1/dreams/${id}/interpret`).set(authHeader(u.token));
  expect(res.status).toBe(409);
});
```

- [ ] **Step 2: Run to confirm failure** → FAIL.

- [ ] **Step 3: Implement**

Add the `interpret` handler: load the dream (RLS-scoped; 404 if not caller's; 409 if `interpretation` already set), `makeRag(...).buildContext`, `makeClaude(...).interpret`, then persist per §7 Step 7 (`interpretation`, `emotional_tone`, `symbols`, `themes`, `embedding`, `needs_interpretation=false`) and upsert `user_patterns` per §7 Step 8. If Claude throws after retry, store transcript with `needs_interpretation=true` and return 503 with `CLAUDE_UNAVAILABLE`. Wrap external calls with `withRetry` (Claude 1 retry, embeddings 2).

- [ ] **Step 4: Run + commit** → PASS.
```bash
git add apps/api/src/routes/dreams.ts apps/api/__tests__/integration/interpret.test.ts
git commit -m "feat(api): interpret endpoint — RAG + Claude + persist + degraded modes"
```

---

### Task 12: Account deletion endpoint

**Files:**
- Create: `apps/api/src/routes/account.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/__tests__/integration/account.test.ts`

**Interfaces:**
- Produces: `DELETE /v1/account` → deletes dreams, user_patterns, user_profile, and the auth user (service_role); 200 on success.

- [ ] **Step 1: Write failing test**

```typescript
// apps/api/__tests__/integration/account.test.ts
import request from 'supertest';
import { app } from '../../src/app';
import { authHeader, seedUser } from '../helpers';
it('DELETE /v1/account removes the user data and returns 200', async () => {
  const u = await seedUser();
  const res = await request(app).delete('/v1/account').set(authHeader(u.token));
  expect(res.status).toBe(200);
});
it('401 without auth', async () => { expect((await request(app).delete('/v1/account')).status).toBe(401); });
```

- [ ] **Step 2: Run to confirm failure** → FAIL.

- [ ] **Step 3: Implement**

Implement the §10 `deleteAccount(userId)` sequence (dreams → user_patterns → user_profiles → `supabaseAdmin.auth.admin.deleteUser`). Note in a code comment that Apple token revocation (§4A) is added when Apple sign-in ships.

- [ ] **Step 4: Run + commit** → PASS.
```bash
git add apps/api/src/routes/account.ts apps/api/src/app.ts apps/api/__tests__/integration/account.test.ts
git commit -m "feat(api): account deletion endpoint (App Store requirement)"
```

---

### Task 13: Public demo endpoint

**Files:**
- Create: `apps/api/src/routes/demo.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/__tests__/integration/demo.test.ts`

**Interfaces:**
- Produces: `POST /v1/demo/interpret` (no auth, `demoLimiter` 3/hr/IP, `DemoInterpretSchema` ≤1000 chars) → `{ success, data: { summary, themes, emotional_tone, question } }`. This is what the landing page calls.

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/__tests__/integration/demo.test.ts
import request from 'supertest';
import { app } from '../../src/app';
it('returns an interpretation for a valid demo transcript', async () => {
  const res = await request(app).post('/v1/demo/interpret').send({ transcript: 'I dreamed of the ocean and felt calm' });
  expect(res.status).toBe(200);
  expect(res.body.data.summary).toBeDefined();
});
it('400 when transcript too short', async () => {
  expect((await request(app).post('/v1/demo/interpret').send({ transcript: 'hi' })).status).toBe(400);
});
```

- [ ] **Step 2: Run to confirm failure** → FAIL.

- [ ] **Step 3: Implement**

`demo.ts`: `demoLimiter` + `validate(DemoInterpretSchema)`; call `makeClaude(...).interpret` with **no** user history/RAG (or a light general prompt), map to the demo shape `{ summary, themes, emotional_tone, question }`. This matches the landing page's `${DREAMLENS_API_BASE}/v1/demo/interpret` contract.

- [ ] **Step 4: Run + commit** → PASS.
```bash
git add apps/api/src/routes/demo.ts apps/api/src/app.ts apps/api/__tests__/integration/demo.test.ts
git commit -m "feat(api): public rate-limited demo interpret endpoint"
```

---

### Task 14: CI pipeline

**Files:**
- Create: `.github/workflows/test.yml`, `.github/workflows/security-dast.yml`, `.github/dependabot.yml`
- Test: (meta) the workflow runs green on the PR.

**Interfaces:**
- Produces: per-PR test + patch-coverage + OWASP scan jobs (from engineering-standards §6 as edited this session).

- [ ] **Step 1: Add the workflows**

Copy `test.yml` (incl. the `diff-cover --fail-under=85` patch-coverage steps and the `security-scan` job with Trivy + Semgrep + the license-free gitleaks CLI), `security-dast.yml` (weekly OWASP ZAP against staging), and `dependabot.yml` verbatim from engineering-standards §6 / §14.

- [ ] **Step 2: Push a PR and confirm green**

Run: open a PR; confirm `test-api`, `test-mobile`, `security-scan` jobs pass.
Expected: all green; patch coverage ≥ 85%.

- [ ] **Step 3: Commit**

```bash
git add .github
git commit -m "ci: test + patch-coverage + OWASP security scans"
```

---

## Self-Review

- **Phase 0 coverage:** monorepo + strict TS (Task 1) ✓; schema (Task 2) ✓; RLS + RPC (Task 3) ✓; KB seed + embed (Task 4) ✓; Sentry/logging (Task 5) ✓; CI (Task 14) ✓.
- **Phase 1 coverage:** auth (Task 6) ✓; rate-limit + validation (Task 7) ✓; dreams CRUD + free-tier gate (Task 8) ✓; RAG (Task 9) ✓; Claude (Task 10) ✓; interpret (Task 11) ✓; account delete (Task 12) ✓; demo (Task 13) ✓; health (Task 5) ✓.
- **`GET /v1/profile/patterns`** from the standards' Phase-1 list is intentionally deferred to the **pattern-engine plan** (`GET /v1/profile/summary` supersedes it) — noted, not silently dropped.
- **Type/name consistency:** `make*` factory naming is uniform; `DreamInterpretation` shape produced by `makeClaude` (Task 10) is persisted in Task 11 and matches §1; the demo shape (Task 13) matches the landing page contract set earlier this session.
- **Placeholder scan:** where a task says "copy verbatim from §X", the source is an exact, already-written block in the engineering standards (not a vague instruction) — the implementer copies concrete DDL/code. All test code is concrete.
- **Prereqs for the pattern-engine plan:** on completion, the `dreams`/`user_patterns` tables, interpret write-path (§7 Step 8), and the supertest+mock harness all exist — satisfying that plan's Prerequisites section.

---

*End of Phase 0/1 Foundation Plan v1.0*
