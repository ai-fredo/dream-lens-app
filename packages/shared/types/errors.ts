// types/errors.ts

export class DreamLensError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'DreamLensError';
  }
}

export type ErrorCode =
  // RAG/Claude errors
  | 'EMBED_FAILED'
  | 'EMBED_TIMEOUT'
  | 'VECTOR_SEARCH_FAILED'
  | 'CLAUDE_UNAVAILABLE'
  | 'CLAUDE_MALFORMED_RESPONSE'
  | 'CLAUDE_CONTEXT_TOO_LONG'
  // Database errors
  | 'DB_WRITE_FAILED'
  | 'DB_READ_FAILED'
  | 'RECORD_NOT_FOUND'
  | 'UNAUTHORIZED_ACCESS'
  // Input errors
  | 'VALIDATION_ERROR'
  | 'INPUT_TOO_LONG'
  | 'RATE_LIMITED'
  // Auth errors
  | 'UNAUTHORIZED'
  | 'INVALID_TOKEN'
  // Apple Sign-In errors (surfaced as 502 — see apps/api/src/app.ts toHttpError)
  | 'APPLE_EXCHANGE_FAILED'
  | 'APPLE_REVOKE_FAILED';
