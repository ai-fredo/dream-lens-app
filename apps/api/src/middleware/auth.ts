import type { Request, Response, NextFunction } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserId } from '@dreamlens/shared/types/domain';

export function makeRequireAuth(supabase: SupabaseClient) {
  return async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }
    try {
      const { data, error } = await supabase.auth.getUser(h.slice(7));
      if (error || !data.user) {
        res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } });
        return;
      }
      (req as Request & { user?: { id: UserId } }).user = { id: data.user.id as UserId };
      next();
    } catch (err) {
      next(err);
    }
  };
}
