// apps/api/src/index.ts
import * as Sentry from '@sentry/node';
import { app } from './app';

// Fields that may contain dream content and must never leave this process.
const SCRUBBED_FIELDS = ['transcript', 'interpretation'];

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(scrub);
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, val]) => {
      if (SCRUBBED_FIELDS.includes(key)) {
        return [key, '[REDACTED]'];
      }
      return [key, scrub(val)];
    });
    return Object.fromEntries(entries);
  }
  return value;
}

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    beforeSend(event) {
      return scrub(event) as typeof event;
    },
  });
}

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`DreamLens API listening on port ${port}`);
});
