// apps/api/src/services/retry.ts
//
// Generic retry-with-backoff helper (engineering standards §5 "Retry Logic").
// Callers decide attempt counts and delays per use case, e.g.:
//   - Supabase writes: 3 attempts
//   - Claude calls: 1 retry (expensive; don't hammer on timeout)
//   - Embedding calls: 2 retries
import { DreamLensError } from '@dreamlens/shared/types/errors';

export interface WithRetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableErrors?: string[];
}

/**
 * Retries `fn` up to `options.maxAttempts` times with exponential backoff,
 * capped at `options.maxDelayMs`. If `options.retryableErrors` is provided
 * and the thrown error is a `DreamLensError` whose code is not in that list,
 * the error is rethrown immediately without further retries. Otherwise the
 * final error (from the last attempt) is thrown once attempts are exhausted.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: WithRetryOptions): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === options.maxAttempts) break;

      // Only retry on transient errors (when a retryable list is specified).
      if (error instanceof DreamLensError && options.retryableErrors && !options.retryableErrors.includes(error.code)) {
        throw error;
      }

      const delay = Math.min(options.baseDelayMs * Math.pow(2, attempt - 1), options.maxDelayMs);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
