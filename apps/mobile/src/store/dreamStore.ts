import { create } from 'zustand';
import { api } from '../services/api';
import { dreamQueue, type EnqueueInput } from '../services/dreamQueue';
import { sync } from '../services/sync';

/** Server dream DTO shape returned by GET /v1/dreams (apps/api toDreamDto). */
interface ServerDream {
  id: string;
  userId: string;
  recordedAt: string;
  rawTranscript: string;
  editedTranscript: string | null;
  createdAt: string;
}

/** Unified list item: a server-synced dream or a still-pending local one. */
export interface DisplayDream {
  id: string;
  recordedAt: string;
  rawTranscript: string;
  editedTranscript: string | null;
  createdAt: string;
  pending: boolean;
}

export interface DreamStoreState {
  dreams: DisplayDream[];
  upgradeRequired: boolean;
  addLocal(dream: EnqueueInput): Promise<void>;
  refresh(): Promise<void>;
}

function fromServer(d: ServerDream): DisplayDream {
  return {
    id: d.id,
    recordedAt: d.recordedAt,
    rawTranscript: d.rawTranscript,
    editedTranscript: d.editedTranscript,
    createdAt: d.createdAt,
    pending: false,
  };
}

function fromPendingLocal(row: Awaited<ReturnType<typeof dreamQueue.pending>>[number]): DisplayDream {
  return {
    id: row.localId,
    recordedAt: row.recordedAt,
    rawTranscript: row.rawTranscript,
    editedTranscript: row.editedTranscript,
    createdAt: row.createdAt,
    pending: true,
  };
}

export const useDreamStore = create<DreamStoreState>((set) => ({
  dreams: [],
  upgradeRequired: false,

  async addLocal(dream: EnqueueInput) {
    await dreamQueue.enqueue(dream);
    set((state) => ({
      dreams: [
        {
          id: dream.localId,
          recordedAt: dream.recordedAt,
          rawTranscript: dream.rawTranscript,
          editedTranscript: dream.editedTranscript ?? null,
          createdAt: new Date().toISOString(),
          pending: true,
        },
        ...state.dreams,
      ],
    }));
  },

  async refresh() {
    const flushResult = await sync.flush();
    const [serverDreams, stillPending] = await Promise.all([
      api.get<ServerDream[]>('/v1/dreams'),
      dreamQueue.pending(),
    ]);

    set({
      dreams: [...stillPending.map(fromPendingLocal), ...serverDreams.map(fromServer)],
      upgradeRequired: flushResult.upgradeRequired,
    });
  },
}));
