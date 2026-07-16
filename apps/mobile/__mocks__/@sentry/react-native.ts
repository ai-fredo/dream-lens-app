/**
 * Global jest mock for @sentry/react-native — jest-expo auto-uses this for
 * any test that transitively imports src/services/telemetry.ts (including
 * App.test.tsx and ErrorBoundary.test.tsx, since App.tsx calls
 * initTelemetry() at module scope and ErrorBoundary calls captureError()).
 * The real native module isn't available under jest-expo, and we never
 * want tests to hit a real Sentry SDK anyway.
 */
export const init = jest.fn();
export const captureException = jest.fn();
