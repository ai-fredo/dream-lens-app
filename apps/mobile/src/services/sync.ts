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
 */
async function flush(): Promise<FlushResult> {
  const rows = await dreamQueue.pending();

  let synced = 0;
  let failed = 0;
  let upgradeRequired = false;

  for (const row of rows) {
    try {
      const created = await api.post<CreatedDream>('/v1/dreams', {
        recorded_at: row.recordedAt,
        raw_transcript: row.rawTranscript,
        ...(row.editedTranscript ? { edited_transcript: row.editedTranscript } : {}),
      });
      await dreamQueue.markSynced(row.localId, created.id);
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

export const sync = { flush };
