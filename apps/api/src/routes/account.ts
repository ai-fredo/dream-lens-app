// apps/api/src/routes/account.ts
import { Router, type Request, type Response, type NextFunction } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserId } from '@dreamlens/shared/types/domain';
import { DreamLensError } from '@dreamlens/shared/types/errors';
import { makeRequireAuth } from '../middleware/auth';
import { generalLimiter } from '../middleware/rateLimit';

/**
 * Dependencies injected into the account router.
 * - `authClient` feeds `makeRequireAuth` (token verification only) — the
 *   caller must present a valid bearer token, same as every other route.
 * - `adminClient` is the service_role (RLS-bypassing) Supabase client used to
 *   perform the actual deletion across tables and the auth user. It is only
 *   ever invoked with the userId taken from the *verified token* — never from
 *   request body/params/query — so a caller can only ever delete their own
 *   account even though the client itself has no per-row RLS restriction.
 */
export interface AccountDeps {
  authClient: SupabaseClient;
  adminClient: SupabaseClient;
}

// Express's Request has no `.user` by default; auth middleware attaches it.
type AuthedRequest = Request & { user?: { id: UserId } };

/**
 * §10 "Account Deletion" sequence, run with the service-role admin client so
 * it can delete across tables and remove the Supabase Auth user itself:
 *   1. dreams (cascade handles related tables via FK)
 *   2. user_patterns
 *   3. user_profiles
 *   4. the Supabase Auth user (supabaseAdmin.auth.admin.deleteUser)
 *
 * Any step failing throws a DreamLensError so the caller gets a 500 envelope
 * instead of a partial-success 200 — we never swallow a mid-sequence error.
 *
 * NOTE (§4A): when Sign in with Apple ships, add a step here to revoke the
 * user's Apple refresh token (Apple requirement since June 2023) before/along
 * with deleting the Supabase Auth user. Not implemented yet — no Apple sign-in
 * in this codebase today.
 */
async function deleteAccount(adminClient: SupabaseClient, userId: UserId): Promise<void> {
  const { error: dreamsErr } = await adminClient.from('dreams').delete().eq('user_id', userId);
  if (dreamsErr) {
    throw new DreamLensError('DB_WRITE_FAILED', 'Failed to delete dreams during account deletion');
  }

  const { error: patternsErr } = await adminClient.from('user_patterns').delete().eq('user_id', userId);
  if (patternsErr) {
    throw new DreamLensError('DB_WRITE_FAILED', 'Failed to delete user_patterns during account deletion');
  }

  const { error: profileErr } = await adminClient.from('user_profiles').delete().eq('id', userId);
  if (profileErr) {
    throw new DreamLensError('DB_WRITE_FAILED', 'Failed to delete user_profile during account deletion');
  }

  const { error: authErr } = await adminClient.auth.admin.deleteUser(userId);
  if (authErr) {
    throw new DreamLensError('DB_WRITE_FAILED', 'Failed to delete auth user during account deletion');
  }
}

export function makeAccountRouter(deps: AccountDeps): Router {
  const router = Router();
  const requireAuth = makeRequireAuth(deps.authClient);

  router.use('/v1/account', generalLimiter, requireAuth);

  // DELETE /v1/account — deletes the caller's own dreams, user_patterns,
  // user_profile, and Supabase Auth user (Apple App Store requirement, §10).
  // Never logs dream content; userId comes only from the verified token.
  router.delete('/v1/account', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as AuthedRequest).user!.id;
      await deleteAccount(deps.adminClient, userId);
      res.status(200).json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
