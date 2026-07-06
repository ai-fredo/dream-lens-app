// apps/api/src/app.ts
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { healthRouter } from './routes/health';
import { requestLogger } from './middleware/logger';

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
 * Factory function to create an Express app with standard middleware and routes.
 * @param extraRoutes Optional callback to register additional routes before the error handler.
 */
export function makeApp(extraRoutes?: (app: express.Express) => void): express.Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: (process.env.CORS_ALLOWLIST ?? '').split(',').filter(Boolean) }));
  app.use(express.json({ limit: '256kb' }));
  app.use(requestLogger);
  app.use(healthRouter);

  // Register any extra routes before the error handler
  if (extraRoutes) {
    extraRoutes(app);
  }

  // Error handler must be registered last
  app.use(errorHandler);

  return app;
}

export const app = makeApp();
