// apps/mobile/src/services/telemetry.ts
import * as Sentry from '@sentry/react-native';

// Fields that may contain dream content and must never leave this device.
// Mirrors the scrubber in apps/api/src/index.ts, extended with the mobile
// app's own field names for raw/edited transcripts and interpretation notes.
const SCRUBBED_FIELDS = [
  'transcript',
  'rawTranscript',
  'editedTranscript',
  'interpretation',
  'notes',
  'summary',
];

/**
 * Recursively replaces the values of any dream-content-bearing key (see
 * SCRUBBED_FIELDS) with '[REDACTED]', at any nesting depth, in both objects
 * and arrays. Used as Sentry's `beforeSend` hook so no dream text can ever
 * reach Sentry, whether it's on the top-level event or buried in
 * `event.extra` / `event.breadcrumbs[].data`.
 */
export function scrubEvent<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => scrubEvent(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, val]) => {
      if (SCRUBBED_FIELDS.includes(key)) {
        return [key, '[REDACTED]'];
      }
      return [key, scrubEvent(val)];
    });
    return Object.fromEntries(entries) as T;
  }
  return value;
}

let initialized = false;

/**
 * Env-gated Sentry init. No-ops unless EXPO_PUBLIC_SENTRY_DSN is set (e.g.
 * in local dev / preview builds without a DSN configured), so telemetry is
 * opt-in per environment rather than always-on.
 */
export function initTelemetry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    sendDefaultPii: false,
    beforeSend: (event) => scrubEvent(event),
  });
  initialized = true;
}

/**
 * Reports a caught Error to Sentry — a no-op until initTelemetry() has run
 * with a DSN configured. Callers must only ever pass the Error object
 * itself (never component props/state or raw dream text) — see
 * ErrorBoundary's class doc comment for why.
 */
export function captureError(error: unknown): void {
  if (!initialized) return;
  Sentry.captureException(error);
}
