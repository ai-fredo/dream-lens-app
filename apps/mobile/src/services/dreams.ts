import * as Crypto from 'expo-crypto';
import { dreamQueue } from './dreamQueue';
import { sync } from './sync';

/** Client-side transcript cap, mirroring the API's CreateDreamSchema max(5000). */
const TRANSCRIPT_MAX_LENGTH = 5000;

export interface SubmitInput {
  rawTranscript: string;
  editedTranscript?: string;
  recordedAt: string;
  interpret: boolean;
}

export type SubmitResult =
  | { syncedId: string }
  | { saved: true }
  | { queued: true }
  | { upgradeRequired: true };

/**
 * Offline-first create-and-interpret flow (Task 7).
 *
 * Always writes to the local queue first — a dream must never be lost to a
 * network blip — then drains the queue via sync.flush(). The outcome for
 * *this* dream is derived from whether flush() reports our own localId as
 * synced (via the onSynced callback) or upgradeRequired:
 *
 *  - synced + interpret        -> { syncedId }        (caller navigates to
 *                                  Interpretation, which owns the interpret
 *                                  call and its own loading state)
 *  - synced + !interpret       -> { saved: true }      (caller navigates to
 *                                  Journal; the dream is already persisted)
 *  - not synced + upgradeRequired -> { upgradeRequired: true } (Paywall)
 *  - not synced (network, or any other reason) -> { queued: true } (Journal;
 *                                  the pending row is visible there — no
 *                                  error shown, the transcript is safe)
 */
async function submit(input: SubmitInput): Promise<SubmitResult> {
  if (input.rawTranscript.length > TRANSCRIPT_MAX_LENGTH) {
    throw new Error(`rawTranscript exceeds ${TRANSCRIPT_MAX_LENGTH} characters`);
  }
  if (input.editedTranscript !== undefined && input.editedTranscript.length > TRANSCRIPT_MAX_LENGTH) {
    throw new Error(`editedTranscript exceeds ${TRANSCRIPT_MAX_LENGTH} characters`);
  }

  await dreamQueue.init();

  const localId = Crypto.randomUUID();
  const includeEdited =
    input.editedTranscript !== undefined && input.editedTranscript !== input.rawTranscript;

  await dreamQueue.enqueue({
    localId,
    recordedAt: input.recordedAt,
    rawTranscript: input.rawTranscript,
    ...(includeEdited ? { editedTranscript: input.editedTranscript as string } : {}),
  });

  let syncedId: string | null = null;
  const flushResult = await sync.flush((flushedLocalId, flushedSyncedId) => {
    if (flushedLocalId === localId) {
      syncedId = flushedSyncedId;
    }
  });

  if (syncedId !== null) {
    return input.interpret ? { syncedId } : { saved: true };
  }

  if (flushResult.upgradeRequired) {
    return { upgradeRequired: true };
  }

  return { queued: true };
}

export const dreams = { submit };
