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
import { getAnonClient } from './db/client';

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
  return { status, code };
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

export interface MakeAppOptions {
  /** Optional callback to register additional routes before the error handler. */
  extraRoutes?: (app: express.Express) => void;
  /** Injected dreams deps (tests pass a fake); omitted → lazy prod deps. */
  dreamsDeps?: DreamsDeps;
}

/**
 * Factory function to create an Express app with standard middleware and routes.
 */
export function makeApp(options: MakeAppOptions = {}): express.Express {
  const { extraRoutes, dreamsDeps } = options;
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: (process.env.CORS_ALLOWLIST ?? '').split(',').filter(Boolean) }));
  app.use(express.json({ limit: '256kb' }));
  app.use(requestLogger);
  app.use(healthRouter);

  // Dreams router. Deps are injected in tests; otherwise built lazily so no
  // env is read at mount time.
  app.use(makeDreamsRouter(dreamsDeps ?? prodDreamsDeps()));

  // Register any extra routes before the error handler
  if (extraRoutes) {
    extraRoutes(app);
  }

  // Error handler must be registered last
  app.use(errorHandler);

  return app;
}

export const app = makeApp();
