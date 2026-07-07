// apps/api/src/routes/dreams.ts
import { Router, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type OpenAI from 'openai';
import type Anthropic from '@anthropic-ai/sdk';
import type { UserId } from '@dreamlens/shared/types/domain';
import { DreamLensError } from '@dreamlens/shared/types/errors';
import { makeRequireAuth } from '../middleware/auth';
import { generalLimiter, interpretLimiter as sharedInterpretLimiter } from '../middleware/rateLimit';
import { validate, CreateDreamSchema, UpdateTranscriptSchema } from '../validation/schemas';
import { makeRag } from '../services/rag';
import { makeClaude } from '../services/claude';
import { makePatternStats } from '../services/patternStats';
import { makePatternSummary } from '../services/patternSummary';
import { makeInsights } from '../services/insights';
import { withRetry } from '../services/retry';
import { logger } from '../middleware/logger';

/**
 * Dependencies injected into the dreams router.
 * - `authClient` feeds `makeRequireAuth` (token verification only).
 * - `clientForToken` returns a request-scoped Supabase client carrying the
 *   caller's JWT so RLS enforces ownership in production; in tests the fake
 *   scopes the same way (a wrong-user read finds no rows → 404).
 * - `openai` / `anthropic` are the AI clients the RAG + Claude services need.
 *   The interpret handler composes `makeRag(requestScopedDb, openai)` and
 *   `makeClaude(anthropic)` per request. Tests inject fakes with the same
 *   minimal shape (embeddings.create / messages.create); prod builds real
 *   clients lazily from env so importing this module needs no env vars.
 * - `interpretLimiter` guards the interpret route (5/min per user in prod).
 *   Injectable so tests can pass a no-op (staying under the shared limit) or a
 *   always-429 stub (asserting the limiter is mounted). Defaults to the shared
 *   `interpretLimiter` middleware.
 */
export interface DreamsDeps {
  authClient: SupabaseClient;
  clientForToken(token: string): SupabaseClient;
  openai: OpenAI;
  anthropic: Anthropic;
  interpretLimiter?: RequestHandler;
}

// Express's Request has no `.user` by default; auth middleware attaches it.
type AuthedRequest = Request & { user?: { id: UserId } };

const FREE_TIER_DREAM_LIMIT = 10;

/** Bearer token from the Authorization header (auth middleware already validated it). */
function bearer(req: Request): string {
  return (req.headers.authorization ?? '').slice(7);
}

/** Map a stored snake_case dream row to the API's camelCase shape.
 * `interpretation` is stored as-is (already camelCase JSONB written by the
 * interpret handler below) — pass it through unmodified so GET /v1/dreams/:id
 * lets callers (e.g. the mobile app's useInterpretation hook) tell an
 * already-interpreted dream from one that still needs POST .../interpret. */
function toDreamDto(row: {
  id: string;
  user_id: string;
  recorded_at: string;
  raw_transcript: string;
  edited_transcript: string | null;
  created_at: string;
  interpretation?: unknown;
  notes?: string | null;
}) {
  return {
    id: row.id,
    userId: row.user_id,
    recordedAt: row.recorded_at,
    rawTranscript: row.raw_transcript,
    editedTranscript: row.edited_transcript,
    createdAt: row.created_at,
    interpretation: row.interpretation ?? null,
    notes: row.notes ?? null,
  };
}

/** Stored dream row shape the interpret handler reads/writes (superset of toDreamDto's input). */
interface InterpretDreamRow {
  id: string;
  user_id: string;
  raw_transcript: string;
  edited_transcript: string | null;
  interpretation: unknown;
}

export function makeDreamsRouter(deps: DreamsDeps): Router {
  const router = Router();
  const requireAuth = makeRequireAuth(deps.authClient);

  // All dream routes require auth and share the general rate limit (§4.2).
  router.use('/v1/dreams', generalLimiter, requireAuth);

  // POST /v1/dreams — create (free-tier gate at >=10 dreams).
  router.post(
    '/v1/dreams',
    validate(CreateDreamSchema),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = (req as AuthedRequest).user!.id;
        const db = deps.clientForToken(bearer(req));

        const { data: profile, error: profileErr } = await db
          .from('user_profiles')
          .select('dream_count, subscription_tier')
          .eq('id', userId)
          .single();
        if (profileErr || !profile) {
          res
            .status(404)
            .json({ success: false, error: { code: 'PROFILE_NOT_FOUND', message: 'Profile not found' } });
          return;
        }

        const { dream_count: dreamCount, subscription_tier: tier } = profile as {
          dream_count: number;
          subscription_tier: string;
        };
        if (tier === 'free' && dreamCount >= FREE_TIER_DREAM_LIMIT) {
          res.status(402).json({
            success: false,
            error: {
              code: 'UPGRADE_REQUIRED',
              message: 'Free plan is limited to 10 dreams. Upgrade to add more.',
            },
          });
          return;
        }

        // req.body is the validated/parsed CreateDreamSchema output.
        const body = req.body as { rawTranscript: string; editedTranscript?: string | null; recordedAt: string };
        const { data: created, error: insertErr } = await db
          .from('dreams')
          .insert({
            user_id: userId,
            recorded_at: body.recordedAt,
            raw_transcript: body.rawTranscript,
            edited_transcript: body.editedTranscript ?? null,
          })
          .select()
          .single();
        if (insertErr || !created) {
          next(insertErr ?? new Error('Insert failed'));
          return;
        }

        await db
          .from('user_profiles')
          .update({ dream_count: dreamCount + 1 })
          .eq('id', userId);

        res.status(201).json({ success: true, data: toDreamDto(created as Parameters<typeof toDreamDto>[0]) });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /v1/dreams — list caller-owned dreams, newest first, paginated.
  router.get('/v1/dreams', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as AuthedRequest).user!.id;
      const db = deps.clientForToken(bearer(req));

      const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? '20'), 10) || 20, 1), 100);
      const offset = Math.max(Number.parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);

      const { data, error } = await db
        .from('dreams')
        .select('*')
        .eq('user_id', userId)
        .order('recorded_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) {
        next(error);
        return;
      }

      const rows = (data ?? []) as Parameters<typeof toDreamDto>[0][];
      res.status(200).json({ success: true, data: rows.map(toDreamDto) });
    } catch (err) {
      next(err);
    }
  });

  // GET /v1/dreams/:id — fetch one owned dream (wrong user → 404 via RLS scope).
  router.get('/v1/dreams/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const db = deps.clientForToken(bearer(req));
      const { data, error } = await db.from('dreams').select('*').eq('id', req.params.id).single();
      if (error || !data) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Dream not found' } });
        return;
      }
      res.status(200).json({ success: true, data: toDreamDto(data as Parameters<typeof toDreamDto>[0]) });
    } catch (err) {
      next(err);
    }
  });

  // POST /v1/dreams/:id/interpret — RAG + Claude + persist (§7).
  // Wrong user or missing → 404 (RLS scope); already interpreted → 409;
  // Claude down after retry → 503 with needs_interpretation=true.
  const limiter = deps.interpretLimiter ?? sharedInterpretLimiter;
  router.post(
    '/v1/dreams/:id/interpret',
    limiter,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = (req as AuthedRequest).user!.id;
        const db = deps.clientForToken(bearer(req));

        // Load the dream (RLS-scoped: a wrong-user id finds no row → 404).
        const { data: dream, error: loadErr } = await db
          .from('dreams')
          .select('*')
          .eq('id', req.params.id)
          .single();
        if (loadErr || !dream) {
          res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Dream not found' } });
          return;
        }
        const row = dream as InterpretDreamRow;

        // Idempotency: refuse to re-interpret an already-interpreted dream.
        if (row.interpretation != null) {
          res.status(409).json({
            success: false,
            error: { code: 'ALREADY_INTERPRETED', message: 'This dream has already been interpreted.' },
          });
          return;
        }

        const transcript = row.edited_transcript ?? row.raw_transcript;
        const rag = makeRag(db, deps.openai);
        const claude = makeClaude(deps.anthropic);

        // RAG context: embeddings get 2 retries (§5). buildContext never throws
        // on embed failure (degraded mode) — retry guards transient RPC errors.
        const context = await withRetry(() => rag.buildContext(userId, transcript), {
          maxAttempts: 3, // initial + 2 retries
          baseDelayMs: 100,
          maxDelayMs: 1000,
        });

        // Claude: 1 retry (expensive). If it still throws, degrade to 503 and
        // flag the dream for later interpretation (§5 / error table).
        let interpretation;
        try {
          interpretation = await withRetry(
            () =>
              claude.interpret({
                transcript,
                symbolContext: context.symbolContext,
                patternContext: context.patternContext,
              }),
            { maxAttempts: 2, baseDelayMs: 200, maxDelayMs: 1000 }, // initial + 1 retry
          );
        } catch {
          // Never log dream content — only the fact that Claude was unavailable.
          logger.warn({ event: 'interpret_degraded', code: 'CLAUDE_UNAVAILABLE' });
          await db.from('dreams').update({ needs_interpretation: true }).eq('id', row.id);
          res.status(503).json({
            success: false,
            error: {
              code: 'CLAUDE_UNAVAILABLE',
              message: "Your dream is saved. We'll interpret it shortly.",
            },
          });
          return;
        }

        // Step 7 — Persist interpretation + derived columns + embedding.
        const { error: updateErr } = await db
          .from('dreams')
          .update({
            interpretation,
            emotional_tone: interpretation.emotionalTone,
            symbols: interpretation.symbols,
            themes: interpretation.themes,
            embedding: context.embedding,
            needs_interpretation: false,
          })
          .eq('id', row.id);
        if (updateErr) {
          next(new DreamLensError('DB_WRITE_FAILED', 'Failed to persist interpretation'));
          return;
        }

        // Step 8 — Upsert user_patterns: +1 occurrence per interpreted symbol
        // and theme. Never throws — pattern bookkeeping must not fail an
        // otherwise-successful interpretation (best-effort, code-only warn on
        // error, no dream content logged).
        try {
          await makePatternStats(db).updateOnDream(userId, {
            symbols: interpretation.symbols ?? [],
            themes: interpretation.themes ?? [],
          });

          // Step 9 — Derive insights (e.g. recurring_symbol) from the fresh
          // pattern summary. Skip when the summary is degraded: a failed
          // patterns/dreams fetch would make counts look like 0, and deriving
          // off that unreliable data could cause a threshold to spuriously
          // re-fire later once the real counts are visible again. Known
          // trade-off: insights fire only on EXACT threshold counts (3/5/7),
          // so if the skip lands on the exact interpret that crosses a
          // threshold, that insight is permanently missed (count moves past
          // it next dream). Deliberate: a missed card beats a false one.
          // Same failure-isolation contract as patternStats above — this
          // whole block is best-effort and must never fail the interpret
          // request.
          const { summary, degraded } = await makePatternSummary(db).getForUserWithMeta(userId);
          if (!degraded) {
            await makeInsights(db).derive(userId, summary);
          }
        } catch (err) {
          logger.warn({ event: 'user_pattern_upsert_failed', code: 'DB_WRITE_FAILED', message: (err as Error).message });
        }

        res.status(200).json({ success: true, data: interpretation });
      } catch (err) {
        next(err);
      }
    },
  );

  // PUT /v1/dreams/:id — edit the transcript and/or notes (wrong user → 404
  // via RLS scope). Both fields are optional so callers can update either
  // independently (e.g. the mobile app's autosave-on-blur notes field sends
  // only `notes`). Never log `notes` or `editedTranscript` content — same
  // rule as transcripts elsewhere in this file.
  router.put(
    '/v1/dreams/:id',
    validate(UpdateTranscriptSchema),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const db = deps.clientForToken(bearer(req));
        const body = req.body as { editedTranscript?: string; notes?: string };
        const updates: Record<string, string> = {};
        if (body.editedTranscript !== undefined) updates.edited_transcript = body.editedTranscript;
        if (body.notes !== undefined) updates.notes = body.notes;

        const { data, error } = await db
          .from('dreams')
          .update(updates)
          .eq('id', req.params.id)
          .select()
          .single();
        if (error || !data) {
          res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Dream not found' } });
          return;
        }
        res.status(200).json({ success: true, data: toDreamDto(data as Parameters<typeof toDreamDto>[0]) });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
