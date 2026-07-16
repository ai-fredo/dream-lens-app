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
 *
 * RESIDUAL-RISK POLICY: this redaction is key-name-based only. Free-text
 * string fields such as `event.message`, `exception.values[].value`, and
 * `breadcrumbs[].message` are NOT content-scanned — a key-based scrubber
 * cannot tell "static developer string" from "dream transcript" once it's
 * been interpolated into a message. The top-level `event.message` is
 * dropped outright in `beforeSend` (see below). For everything else, the
 * policy is procedural: Errors passed to captureError() must always be
 * constructed with static, hard-coded messages — never with interpolated
 * transcripts, interpretation notes, or other user/dream text.
 */
export function scrubEvent<T>(value: T): T {
  return scrubValue(value, new WeakSet<object>()) as T;
}

function scrubValue(value: unknown, seen: WeakSet<object>): unknown {
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[CIRCULAR]';
    seen.add(value);
    return value.map((item) => scrubValue(item, seen));
  }
  if (value && typeof value === 'object') {
    if (seen.has(value)) return '[CIRCULAR]';
    seen.add(value);
    const entries = Object.entries(value as Record<string, unknown>).map(([key, val]) => {
      if (SCRUBBED_FIELDS.includes(key)) {
        return [key, '[REDACTED]'];
      }
      return [key, scrubValue(val, seen)];
    });
    return Object.fromEntries(entries);
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
    beforeSend: (event) => {
      const scrubbed = scrubEvent(event);
      // DreamLens never calls Sentry.captureMessage, so a populated
      // top-level `message` is always unexpected and — per the
      // residual-risk policy above — is not content-scanned. Dropping it
      // outright is strictly safe: there is no legitimate use of this
      // field that would be lost.
      delete scrubbed.message;
      return scrubbed;
    },
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
