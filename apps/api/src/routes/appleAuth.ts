// apps/api/src/routes/appleAuth.ts
import { Router, type Request, type Response, type NextFunction } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { UserId } from '@dreamlens/shared/types/domain';
import { DreamLensError } from '@dreamlens/shared/types/errors';
import { makeRequireAuth } from '../middleware/auth';
import { generalLimiter } from '../middleware/rateLimit';
import { validate } from '../validation/schemas';
import { isAppleConfigured, exchangeAuthorizationCode } from '../services/appleAuth';

/**
 * Dependencies injected into the Apple-auth router.
 * - `authClient` feeds `makeRequireAuth` (token verification only), same as
 *   every other authed route.
 * - `adminClient` is the service_role (RLS-bypassing) client used to
 *   upsert the caller's Apple refresh token into `apple_credentials` — a
 *   table with RLS enabled and NO policies, so only this client may touch it
 *   (see supabase/migrations/20260709090000_apple_credentials.sql).
 * - `fetchImpl` lets tests inject a fake `fetch` for Apple's token endpoint;
 *   defaults to the global `fetch` in production.
 */
export interface AppleAuthDeps {
  authClient: SupabaseClient;
  adminClient: SupabaseClient;
  fetchImpl?: typeof fetch;
}

// Express's Request has no `.user` by default; auth middleware attaches it.
type AuthedRequest = Request & { user?: { id: UserId } };

const AppleAuthorizationSchema = z.object({
  authorizationCode: z.string().min(1).max(4096),
});

export function makeAppleAuthRouter(deps: AppleAuthDeps): Router {
  const router = Router();
  const requireAuth = makeRequireAuth(deps.authClient);

  router.use('/v1/auth/apple', generalLimiter, requireAuth);

  // POST /v1/auth/apple/authorization — exchange the sign-in
  // authorizationCode for Apple's refresh_token and store it server-side, so
  // DELETE /v1/account can later revoke it (Apple App Store requirement).
  // `stored: false` (not an error) when Apple env isn't configured — lets the
  // mobile client keep working before Apple credentials are provisioned.
  router.post(
    '/v1/auth/apple/authorization',
    validate(AppleAuthorizationSchema),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = (req as AuthedRequest).user!.id;

        if (!isAppleConfigured()) {
          res.status(200).json({ success: true, data: { stored: false } });
          return;
        }

        const body = req.body as { authorizationCode: string };
        const refreshToken = await exchangeAuthorizationCode(body.authorizationCode, deps.fetchImpl);

        const { error } = await deps.adminClient.from('apple_credentials').upsert({
          user_id: userId,
          refresh_token: refreshToken,
          updated_at: new Date().toISOString(),
        });
        if (error) {
          next(new DreamLensError('DB_WRITE_FAILED', 'Failed to store Apple refresh token'));
          return;
        }

        res.status(200).json({ success: true, data: { stored: true } });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
