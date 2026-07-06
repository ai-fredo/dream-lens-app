// apps/api/src/middleware/logger.ts
import crypto from 'crypto';
import winston from 'winston';
import type { NextFunction, Request, Response } from 'express';

/**
 * Structured JSON-lines logger. Per engineering standards §4.5, dream content
 * (transcripts, interpretations) must NEVER be logged. Only metadata (ids,
 * endpoint, status, duration, error codes) may be logged, and user ids must
 * always be hashed before logging — never logged raw.
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: winston.format.json(),
  silent: process.env.NODE_ENV === 'test',
  transports: [new winston.transports.Console()],
});

/**
 * Hashes a user id (sha256, first 16 hex chars) so raw user ids never reach
 * logs. Not for security/auth purposes — purely to keep logs free of PII.
 */
export const hashUserId = (userId: string): string =>
  crypto.createHash('sha256').update(userId).digest('hex').substring(0, 16);

/**
 * Minimal request logger. Logs method, path, status, and duration only.
 * Deliberately never logs request or response bodies — dream transcripts
 * and interpretations must not reach logs.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    logger.info('request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
    });
  });
  next();
}
