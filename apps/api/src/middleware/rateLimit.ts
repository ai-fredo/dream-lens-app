// apps/api/src/middleware/rateLimit.ts
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';
import type { UserId } from '@dreamlens/shared/types/domain';

// Same req.user typing pattern as auth.ts (Express's Request has no .user
// by default, so it's attached via an intersection type at the call site).
type AuthedRequest = Request & { user?: { id: UserId } };

/**
 * Builds the standard `success:false` envelope used for rate-limit (429)
 * bodies, so limiter responses match the shape of every other API error
 * (see errorHandler in app.ts).
 */
export function limitMessage(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

// General API rate limit — all routes. Per engineering standards §4.2.
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('RATE_LIMITED', 'Too many requests. Please try again later.'),
});

// Interpretation endpoint — this calls Claude and costs money.
export const interpretLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // per user (or IP when unauthenticated)
  keyGenerator: (req: Request): string => {
    const userId = (req as AuthedRequest).user?.id;
    // ipKeyGenerator normalizes IPv6 addresses to their /56 subnet (ERL v8 requirement)
    return userId ?? ipKeyGenerator(req.ip ?? 'unknown');
  },
  message: limitMessage('RATE_LIMITED', 'Interpretation limit reached. Please wait a moment.'),
});

// Demo endpoint — public, no auth, must be very tight.
export const demoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 demo interpretations per IP per hour
  message: limitMessage('DEMO_LIMIT', 'Demo limit reached. Create an account for unlimited interpretations.'),
});
