// apps/api/src/app.ts
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { healthRouter } from './routes/health';
import { requestLogger } from './middleware/logger';
import { makeDreamsRouter, type DreamsDeps } from './routes/dreams';
import { makeAccountRouter, type AccountDeps } from './routes/account';
import { makeDemoRouter, type DemoDeps } from './routes/demo';
import { makeProfileRouter, type ProfileDeps } from './routes/profile';
import { makeAppleAuthRouter, type AppleAuthDeps } from './routes/appleAuth';
import { getAnonClient, getServiceClient } from './db/client';

// Error codes thrown as DreamLensError that carry an implicit HTTP status
// other than the 500 default. DreamLensError itself has no `.status` field
// (see packages/shared/types/errors.ts), so the mapping lives here, next to
// the rest of the error-envelope logic.
const CODE_STATUS: Record<string, number> = {
  APPLE_EXCHANGE_FAILED: 502,
  APPLE_REVOKE_FAILED: 502,
};

/** Narrow an unknown thrown value to the fields we care about, without `any`. */
function toHttpError(err: unknown): { status: number; code: string } {
  const status =
    typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status: unknown }).status === 'number'
      ? (err as { status: number }).status
      : 500;
  const code =
    typeof err === 'object' && err !== null && 'code' in err && typeof (err as { code: unknown }).code === 'string'
      ? (err as { code: string }).code
      : 'INTERNAL';
  return { status: CODE_STATUS[code] ?? status, code };
}

// Central error envelope. Typed as express.ErrorRequestHandler with an
// unknown-narrowing helper above, so we never rely on a bare `any`.
const errorHandler: express.ErrorRequestHandler = (err, _req, res, _next) => {
  const { status, code } = toHttpError(err);
  res.status(status).json({ success: false, error: { code, message: 'Something went wrong' } });
};

/**
 * Production dreams deps, built so that NOTHING reads env at import/mount time
 * (this project has no .env in tests, and `export const app = makeApp()` must
 * import cleanly with zero env vars). The `authClient` is a lazy Proxy that
 * only touches env the first time supabase-js is actually used; `clientForToken`
 * reads env per-call to construct a request-scoped, JWT-carrying client whose
 * PostgREST requests run under the caller's RLS policies.
 */
function prodDreamsDeps(): DreamsDeps {
  const authClient = new Proxy({} as SupabaseClient, {
    get(_t, prop) {
      const real = getAnonClient();
      return Reflect.get(real, prop, real);
    },
  });

  // Lazy AI clients: constructed (and their env read) only on first property
  // access, so `export const app = makeApp()` imports cleanly with zero env.
  let openaiReal: OpenAI | null = null;
  const openai = new Proxy({} as OpenAI, {
    get(_t, prop) {
      openaiReal ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      return Reflect.get(openaiReal, prop, openaiReal);
    },
  });
  let anthropicReal: Anthropic | null = null;
  const anthropic = new Proxy({} as Anthropic, {
    get(_t, prop) {
      anthropicReal ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      return Reflect.get(anthropicReal, prop, anthropicReal);
    },
  });

  return {
    authClient,
    openai,
    anthropic,
    clientForToken(token: string): SupabaseClient {
      const url = process.env.SUPABASE_URL;
      const anonKey = process.env.SUPABASE_ANON_KEY;
      if (!url || !anonKey) {
        throw new Error('Missing required environment variable: SUPABASE_URL / SUPABASE_ANON_KEY');
      }
      return createClient(url, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
    },
  };
}

/**
 * Production demo deps, built the same lazily-proxied way as prodDreamsDeps:
 * `anthropic` is a lazy Proxy so importing this module (or
 * `export const app = makeApp()`) needs no env vars — the real client is only
 * constructed on first use inside a request.
 */
function prodDemoDeps(): DemoDeps {
  let anthropicReal: Anthropic | null = null;
  const anthropic = new Proxy({} as Anthropic, {
    get(_t, prop) {
      anthropicReal ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      return Reflect.get(anthropicReal, prop, anthropicReal);
    },
  });
  return { anthropic };
}

/**
 * Production account deps, built the same lazily-proxied way as
 * prodDreamsDeps: `authClient` is a lazy anon-key Proxy for token
 * verification, and `adminClient` is a lazy service_role Proxy so importing
 * this module (or `export const app = makeApp()`) needs no env vars — the
 * service-role client is only actually constructed on first use inside a
 * request.
 */
function prodAccountDeps(): AccountDeps {
  const authClient = new Proxy({} as SupabaseClient, {
    get(_t, prop) {
      const real = getAnonClient();
      return Reflect.get(real, prop, real);
    },
  });
  const adminClient = new Proxy({} as SupabaseClient, {
    get(_t, prop) {
      const real = getServiceClient();
      return Reflect.get(real, prop, real);
    },
  });
  return { authClient, adminClient };
}

/**
 * Production profile deps, built the same lazily-proxied way as
 * prodDreamsDeps: `authClient` is a lazy anon-key Proxy for token
 * verification, and `clientForToken` reads env per-call to construct a
 * request-scoped, JWT-carrying client whose PostgREST requests run under the
 * caller's RLS policies. Importing this module (or `export const app =
 * makeApp()`) reads no env vars.
 */
function prodProfileDeps(): ProfileDeps {
  const authClient = new Proxy({} as SupabaseClient, {
    get(_t, prop) {
      const real = getAnonClient();
      return Reflect.get(real, prop, real);
    },
  });
  return {
    authClient,
    clientForToken(token: string): SupabaseClient {
      const url = process.env.SUPABASE_URL;
      const anonKey = process.env.SUPABASE_ANON_KEY;
      if (!url || !anonKey) {
        throw new Error('Missing required environment variable: SUPABASE_URL / SUPABASE_ANON_KEY');
      }
      return createClient(url, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
    },
  };
}

/**
 * Production Apple-auth deps, built the same lazily-proxied way as
 * prodAccountDeps: `authClient` is a lazy anon-key Proxy for token
 * verification, and `adminClient` is a lazy service_role Proxy so importing
 * this module (or `export const app = makeApp()`) needs no env vars — the
 * service-role client is only actually constructed on first use inside a
 * request. `fetchImpl` is left undefined so the service functions fall back
 * to the global `fetch`.
 */
function prodAppleAuthDeps(): AppleAuthDeps {
  const authClient = new Proxy({} as SupabaseClient, {
    get(_t, prop) {
      const real = getAnonClient();
      return Reflect.get(real, prop, real);
    },
  });
  const adminClient = new Proxy({} as SupabaseClient, {
    get(_t, prop) {
      const real = getServiceClient();
      return Reflect.get(real, prop, real);
    },
  });
  return { authClient, adminClient };
}

export interface MakeAppOptions {
  /** Optional callback to register additional routes before the error handler. */
  extraRoutes?: (app: express.Express) => void;
  /** Injected dreams deps (tests pass a fake); omitted → lazy prod deps. */
  dreamsDeps?: DreamsDeps;
  /** Injected account deps (tests pass a fake); omitted → lazy prod deps. */
  accountDeps?: AccountDeps;
  /** Injected demo deps (tests pass a fake); omitted → lazy prod deps. */
  demoDeps?: DemoDeps;
  /** Injected profile deps (tests pass a fake); omitted → lazy prod deps. */
  profileDeps?: ProfileDeps;
  /** Injected Apple-auth deps (tests pass a fake); omitted → lazy prod deps. */
  appleAuthDeps?: AppleAuthDeps;
}

/**
 * Factory function to create an Express app with standard middleware and routes.
 */
export function makeApp(options: MakeAppOptions = {}): express.Express {
  const { extraRoutes, dreamsDeps, accountDeps, demoDeps, profileDeps, appleAuthDeps } = options;
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: (process.env.CORS_ALLOWLIST ?? '').split(',').filter(Boolean) }));
  app.use(express.json({ limit: '256kb' }));
  app.use(requestLogger);
  app.use(healthRouter);

  // Dreams router. Deps are injected in tests; otherwise built lazily so no
  // env is read at mount time.
  app.use(makeDreamsRouter(dreamsDeps ?? prodDreamsDeps()));

  // Account router (deletion, App Store requirement §10). Deps are injected
  // in tests; otherwise built lazily so no env is read at mount time.
  app.use(makeAccountRouter(accountDeps ?? prodAccountDeps()));

  // Demo router (public, no auth — backs the landing page). Deps are
  // injected in tests; otherwise built lazily so no env is read at mount time.
  app.use(makeDemoRouter(demoDeps ?? prodDemoDeps()));

  // Profile router (authed patterns view + insight-seen, §8). Deps are
  // injected in tests; otherwise built lazily so no env is read at mount time.
  app.use(makeProfileRouter(profileDeps ?? prodProfileDeps()));

  // Apple-auth router (captures the Sign in with Apple refresh_token so
  // DELETE /v1/account can revoke it — App Store requirement). Deps are
  // injected in tests; otherwise built lazily so no env is read at mount time.
  app.use(makeAppleAuthRouter(appleAuthDeps ?? prodAppleAuthDeps()));

  // Register any extra routes before the error handler
  if (extraRoutes) {
    extraRoutes(app);
  }

  // Terminal catch-all for unmatched routes. Must come after all routers
  // (including extraRoutes) so it never shadows a mounted route, and before
  // the error handler so unknown routes get the JSON envelope instead of
  // Express 5's default HTML 404 page.
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
  });

  // Error handler must be registered last
  app.use(errorHandler);

  return app;
}

export const app = makeApp();
