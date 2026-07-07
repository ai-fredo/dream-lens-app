// apps/api/src/routes/profile.ts
//
// Profile endpoints (§8): the authed, aggregated "patterns" view the mobile
// app renders, plus the insight-seen write. Both routes require auth and use a
// request-scoped Supabase client so RLS enforces ownership in production (a
// wrong-user insight update finds no row → 404, same as production RLS).
//
// Deps mirror the dreams router's subset (authClient + clientForToken) so the
// wiring in app.ts / makeTestApp stays consistent. Never logs dream content:
// the summary payload carries `recentDreamSummaries` (transcript slices) as
// API output to the OWNING caller (fine), but that content must never appear
// in a log line — the degraded-path warns below are code-only.
import { Router, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserId } from '@dreamlens/shared/types/domain';
import { makeRequireAuth } from '../middleware/auth';
import { generalLimiter as sharedGeneralLimiter } from '../middleware/rateLimit';
import { makePatternSummary } from '../services/patternSummary';
import { makeEmotionArc } from '../services/emotionArc';
import { makeClustering } from '../services/clustering';
import { logger } from '../middleware/logger';

/**
 * Dependencies injected into the profile router.
 * - `authClient` feeds `makeRequireAuth` (token verification only).
 * - `clientForToken` returns a request-scoped Supabase client carrying the
 *   caller's JWT so RLS enforces ownership in production; in tests the fake
 *   scopes the same way (a wrong-user read/update finds no rows).
 * - `generalLimiter` is injectable (like the dreams router's limiters) so tests
 *   can pass a no-op that stays under the shared IP limit. Defaults to the
 *   shared `generalLimiter` middleware.
 */
export interface ProfileDeps {
  authClient: SupabaseClient;
  clientForToken(token: string): SupabaseClient;
  generalLimiter?: RequestHandler;
}

// Express's Request has no `.user` by default; auth middleware attaches it.
type AuthedRequest = Request & { user?: { id: UserId } };

/** Bearer token from the Authorization header (auth middleware already validated it). */
function bearer(req: Request): string {
  return (req.headers.authorization ?? '').slice(7);
}

/**
 * One unseen insight row as returned to the client. Snake_case columns are
 * preserved from the DB row (the mobile client reads them as-is, consistent
 * with the rest of the insights pipeline which stores snake_case).
 */
interface InsightRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  payload: unknown;
  created_at: string;
  seen_at: string | null;
}

// Validate `:id` is a UUID before it reaches the DB — rejects junk ids with a
// 400 envelope instead of a pointless DB round-trip. The fake harness therefore
// seeds UUID-shaped insight ids (see fakeSupabase.ts).
const InsightIdParam = z.string().uuid();

export function makeProfileRouter(deps: ProfileDeps): Router {
  const router = Router();
  const requireAuth = makeRequireAuth(deps.authClient);
  const limiter = deps.generalLimiter ?? sharedGeneralLimiter;

  // GET /v1/profile/summary — the aggregated patterns view. Every section
  // degrades independently to an empty/default value on a fetch error (still
  // 200): the mobile teaser must always render, even when one query fails.
  router.get(
    '/v1/profile/summary',
    limiter,
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = (req as AuthedRequest).user!.id;
        const db = deps.clientForToken(bearer(req));

        const [summaryMeta, emotionArc, clusters] = await Promise.all([
          makePatternSummary(db).getForUserWithMeta(userId),
          makeEmotionArc(db).getForUser(userId),
          makeClustering(db).getOrRecompute(userId),
        ]);

        // Unseen insights, newest first. Degrade to [] (code-only warn) on error
        // so a failed insights query never blanks the whole summary.
        const { data: insightData, error: insightError } = await db
          .from('user_insights')
          .select('*')
          .eq('user_id', userId)
          .is('seen_at', null)
          .order('created_at', { ascending: false });
        if (insightError) {
          logger.warn({
            event: 'profile_summary_insights_fetch_failed',
            code: (insightError as { code?: string }).code ?? 'DB_READ_FAILED',
          });
        }
        const insights = (insightError ? [] : (insightData ?? [])) as InsightRow[];

        res.status(200).json({
          success: true,
          data: {
            summary: summaryMeta.summary,
            emotionArc,
            clusters,
            insights,
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /v1/insights/:id/seen — mark one caller-owned insight as seen.
  // The request-scoped client already restricts to the caller's rows; the
  // explicit user_id filter is belt-and-suspenders on top of RLS. Wrong user
  // or unknown id → 404 (RLS-scoped update matches no row).
  router.post(
    '/v1/insights/:id/seen',
    limiter,
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const parsed = InsightIdParam.safeParse(req.params.id);
        if (!parsed.success) {
          res
            .status(400)
            .json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid insight id' } });
          return;
        }
        const id = parsed.data;
        const userId = (req as AuthedRequest).user!.id;
        const db = deps.clientForToken(bearer(req));

        const { data, error } = await db
          .from('user_insights')
          .update({ seen_at: new Date().toISOString() })
          .eq('id', id)
          .eq('user_id', userId)
          .select('id');
        if (error) {
          res
            .status(500)
            .json({ success: false, error: { code: 'DB_WRITE_FAILED', message: 'Could not update insight' } });
          return;
        }
        if (!data || (data as unknown[]).length === 0) {
          res
            .status(404)
            .json({ success: false, error: { code: 'RECORD_NOT_FOUND', message: 'Insight not found' } });
          return;
        }
        res.status(200).json({ success: true, data: { id } });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
