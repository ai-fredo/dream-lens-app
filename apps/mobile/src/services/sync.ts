import { api, ApiError } from './api';
import { dreamQueue } from './dreamQueue';

/** Server-shaped dream row returned by POST /v1/dreams. */
interface CreatedDream {
  id: string;
  [key: string]: unknown;
}

export interface FlushResult {
  synced: number;
  failed: number;
  upgradeRequired: boolean;
}

/**
 * Drains the offline dream queue, oldest first, serially — one row is
 * in flight at a time so a burst of pending dreams doesn't hammer the API.
 *
 * Per row:
 *  - success            -> POST succeeds, row is purged via markSynced.
 *  - 402 UPGRADE_REQUIRED -> row is markFailed (not retried this pass), and
 *                            the caller is told to surface an upgrade prompt.
 *  - any other ApiError (notably NETWORK) -> row is left pending, untouched,
 *                            so it is retried on the next flush().
 *
 * `onSynced`, if given, fires once per successfully-synced row (after
 * markSynced) with its (localId, syncedId) pair. This lets a caller that
 * just enqueued a specific row (dreams.submit) learn that row's server id
 * without changing FlushResult's shape — flush() drains the *whole* queue
 * serially, oldest first, so the caller's own row may not be the one that
 * triggers this callback if older rows are also pending.
 */
async function doFlush(onSynced?: (localId: string, syncedId: string) => void): Promise<FlushResult> {
  const rows = await dreamQueue.pending();

  let synced = 0;
  let failed = 0;
  let upgradeRequired = false;

  for (const row of rows) {
    try {
      const created = await api.post<CreatedDream>('/v1/dreams', {
        recordedAt: row.recordedAt,
        rawTranscript: row.rawTranscript,
        ...(row.editedTranscript ? { editedTranscript: row.editedTranscript } : {}),
      });
      await dreamQueue.markSynced(row.localId, created.id);
      onSynced?.(row.localId, created.id);
      synced += 1;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'UPGRADE_REQUIRED') {
        await dreamQueue.markFailed(row.localId);
        failed += 1;
        upgradeRequired = true;
        continue;
      }
      // Network error (or any other transient failure): leave the row
      // pending so the next flush() retries it. Nothing to do here.
    }
  }

  return { synced, failed, upgradeRequired };
}

// Re-entrancy guard: two concurrent callers (e.g. two useDreams consumers
// refreshing at once) must not both read the same pending() snapshot and
// double-POST the same rows. While a flush is in flight, later callers are
// handed the same in-flight promise instead of starting a new pass.
let inFlight: Promise<FlushResult> | null = null;

function flush(onSynced?: (localId: string, syncedId: string) => void): Promise<FlushResult> {
  if (inFlight) return inFlight;

  inFlight = doFlush(onSynced).finally(() => {
    inFlight = null;
  });

  return inFlight;
}

export const sync = { flush };
