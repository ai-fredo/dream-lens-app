// apps/api/src/routes/dreams.ts
import { Router, type Request, type Response, type NextFunction } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserId } from '@dreamlens/shared/types/domain';
import { makeRequireAuth } from '../middleware/auth';
import { generalLimiter } from '../middleware/rateLimit';
import { validate, CreateDreamSchema, UpdateTranscriptSchema } from '../validation/schemas';

/**
 * Dependencies injected into the dreams router.
 * - `authClient` feeds `makeRequireAuth` (token verification only).
 * - `clientForToken` returns a request-scoped Supabase client carrying the
 *   caller's JWT so RLS enforces ownership in production; in tests the fake
 *   scopes the same way (a wrong-user read finds no rows → 404).
 */
export interface DreamsDeps {
  authClient: SupabaseClient;
  clientForToken(token: string): SupabaseClient;
}

// Express's Request has no `.user` by default; auth middleware attaches it.
type AuthedRequest = Request & { user?: { id: UserId } };

const FREE_TIER_DREAM_LIMIT = 10;

/** Bearer token from the Authorization header (auth middleware already validated it). */
function bearer(req: Request): string {
  return (req.headers.authorization ?? '').slice(7);
}

/** Map a stored snake_case dream row to the API's camelCase shape. */
function toDreamDto(row: {
  id: string;
  user_id: string;
  recorded_at: string;
  raw_transcript: string;
  edited_transcript: string | null;
  created_at: string;
}) {
  return {
    id: row.id,
    userId: row.user_id,
    recordedAt: row.recorded_at,
    rawTranscript: row.raw_transcript,
    editedTranscript: row.edited_transcript,
    createdAt: row.created_at,
  };
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

  // PUT /v1/dreams/:id — edit the transcript (wrong user → 404 via RLS scope).
  router.put(
    '/v1/dreams/:id',
    validate(UpdateTranscriptSchema),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const db = deps.clientForToken(bearer(req));
        const body = req.body as { editedTranscript: string };
        const { data, error } = await db
          .from('dreams')
          .update({ edited_transcript: body.editedTranscript })
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
