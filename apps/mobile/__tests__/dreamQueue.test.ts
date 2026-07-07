// In-memory double for expo-secure-store: a Map keyed by SecureStore key name.
// Jest's mock-factory hoisting only allows referencing out-of-scope variables
// whose name starts with "mock" (case-insensitive) — hence the naming below.
const mockSecureStoreMap = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn((key: string) => Promise.resolve(mockSecureStoreMap.get(key) ?? null)),
  setItemAsync: jest.fn((key: string, value: string) => {
    mockSecureStoreMap.set(key, value);
    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn((key: string) => {
    mockSecureStoreMap.delete(key);
    return Promise.resolve();
  }),
}));

// In-memory double for expo-crypto: deterministic-but-unique random bytes so
// successive calls don't collide, and a real hex digest isn't needed here.
let mockRandCounter = 0;
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn((byteCount: number) => {
    mockRandCounter += 1;
    const bytes = new Uint8Array(byteCount);
    for (let i = 0; i < byteCount; i++) {
      bytes[i] = (mockRandCounter + i) % 256;
    }
    return Promise.resolve(bytes);
  }),
}));

// In-memory double for expo-sqlite: a JS array standing in for the
// dream_queue table, driven through the same runAsync/getAllAsync/execAsync
// surface the real SQLiteDatabase exposes. PRAGMA key statements are
// recorded so tests can assert the DB was keyed immediately after opening.
interface MockQueueRow {
  local_id: string;
  recorded_at: string;
  raw_transcript: string;
  edited_transcript: string | null;
  sync_status: string;
  synced_id: string | null;
  created_at: string;
}

let mockRows: MockQueueRow[] = [];
const mockPragmaKeysApplied: string[] = [];
let mockOpenCount = 0;

function mockResetSqliteDouble() {
  mockRows = [];
  mockPragmaKeysApplied.length = 0;
  mockOpenCount = 0;
}

const mockDb = {
  execAsync: jest.fn((sql: string) => {
    const match = /PRAGMA key\s*=\s*'([^']*)'/i.exec(sql);
    if (match) {
      mockPragmaKeysApplied.push(match[1] as string);
    }
    // CREATE TABLE — no-op for the double, schema is implicit in MockQueueRow.
    return Promise.resolve();
  }),
  runAsync: jest.fn((sql: string, ...params: unknown[]) => {
    const bind = (Array.isArray(params[0]) ? params[0] : params) as unknown[];
    if (/^INSERT INTO dream_queue/i.test(sql)) {
      const [local_id, recorded_at, raw_transcript, edited_transcript, sync_status, synced_id, created_at] =
        bind as [string, string, string, string | null, string, string | null, string];
      mockRows.push({
        local_id,
        recorded_at,
        raw_transcript,
        edited_transcript: edited_transcript ?? null,
        sync_status,
        synced_id: synced_id ?? null,
        created_at,
      });
      return Promise.resolve({ changes: 1, lastInsertRowId: mockRows.length });
    }
    if (/^DELETE FROM dream_queue WHERE local_id/i.test(sql)) {
      const [localId] = bind as [string];
      const before = mockRows.length;
      mockRows = mockRows.filter((r) => r.local_id !== localId);
      return Promise.resolve({ changes: before - mockRows.length, lastInsertRowId: 0 });
    }
    if (/^UPDATE dream_queue SET sync_status/i.test(sql)) {
      const [syncStatus, localId] = bind as [string, string];
      const row = mockRows.find((r) => r.local_id === localId);
      if (row) row.sync_status = syncStatus;
      return Promise.resolve({ changes: row ? 1 : 0, lastInsertRowId: 0 });
    }
    return Promise.resolve({ changes: 0, lastInsertRowId: 0 });
  }),
  getAllAsync: jest.fn((sql: string, ...params: unknown[]) => {
    const bind = (Array.isArray(params[0]) ? params[0] : params) as unknown[];
    if (/WHERE sync_status\s*=\s*\?/i.test(sql)) {
      const [status] = bind as [string];
      // Stable sort by created_at, falling back to insertion (rowid) order on
      // ties — matches SQLite's behavior for an unindexed ORDER BY tiebreak
      // and covers rows enqueued within the same millisecond.
      const matched = mockRows
        .map((r, index) => ({ r, index }))
        .filter(({ r }) => r.sync_status === status)
        .sort((a, b) => a.r.created_at.localeCompare(b.r.created_at) || a.index - b.index)
        .map(({ r }) => r);
      return Promise.resolve(matched);
    }
    return Promise.resolve([...mockRows]);
  }),
};

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() => {
    mockOpenCount += 1;
    return Promise.resolve(mockDb);
  }),
}));

import * as SecureStore from 'expo-secure-store';
import { dreamQueue } from '../src/services/dreamQueue';

describe('dreamQueue', () => {
  beforeEach(() => {
    mockSecureStoreMap.clear();
    mockResetSqliteDouble();
    jest.clearAllMocks();
    dreamQueue.__resetForTests();
  });

  describe('init', () => {
    it('generates and persists a 32-byte hex key on first run', async () => {
      await dreamQueue.init();

      const stored = await SecureStore.getItemAsync('dreamlens.dbkey');
      expect(stored).toBeTruthy();
      expect(stored).toMatch(/^[0-9a-f]{64}$/); // 32 bytes = 64 hex chars
    });

    it('applies PRAGMA key immediately after opening the database', async () => {
      await dreamQueue.init();

      expect(mockPragmaKeysApplied.length).toBeGreaterThan(0);
      expect(mockPragmaKeysApplied[0]).toMatch(/^[0-9a-f]{64}$/);
    });

    it('reuses the persisted key on a second init instead of generating a new one', async () => {
      await dreamQueue.init();
      const firstKey = await SecureStore.getItemAsync('dreamlens.dbkey');

      dreamQueue.__resetForTests();
      await dreamQueue.init();
      const secondKey = await SecureStore.getItemAsync('dreamlens.dbkey');

      expect(secondKey).toBe(firstKey);
      expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe('enqueue / pending', () => {
    it('roundtrips an enqueued dream through pending()', async () => {
      await dreamQueue.init();

      await dreamQueue.enqueue({
        localId: 'local-1',
        recordedAt: '2026-07-05T06:00:00.000Z',
        rawTranscript: 'I was flying over a city.',
      });

      const pending = await dreamQueue.pending();
      expect(pending).toHaveLength(1);
      expect(pending[0]).toMatchObject({
        localId: 'local-1',
        recordedAt: '2026-07-05T06:00:00.000Z',
        rawTranscript: 'I was flying over a city.',
        syncStatus: 'pending',
      });
    });

    it('returns pending rows oldest first (queue/created_at order, not recordedAt order)', async () => {
      await dreamQueue.init();

      // Enqueued first even though its recordedAt is later — the queue must
      // order by when it was queued (created_at), so this is "oldest" in
      // queue terms and should sync first.
      await dreamQueue.enqueue({
        localId: 'queued-first',
        recordedAt: '2026-07-05T06:05:00.000Z',
        rawTranscript: 'second dream chronologically, but queued first',
      });
      await dreamQueue.enqueue({
        localId: 'queued-second',
        recordedAt: '2026-07-05T06:00:00.000Z',
        rawTranscript: 'first dream chronologically, but queued second',
      });

      const pending = await dreamQueue.pending();
      expect(pending.map((r) => r.localId)).toEqual(['queued-first', 'queued-second']);
    });
  });

  describe('markSynced', () => {
    it('purges the row entirely rather than flipping a flag', async () => {
      await dreamQueue.init();
      await dreamQueue.enqueue({
        localId: 'local-1',
        recordedAt: '2026-07-05T06:00:00.000Z',
        rawTranscript: 'a dream',
      });

      await dreamQueue.markSynced('local-1', 'server-uuid-1');

      expect(mockRows).toHaveLength(0);
      const pending = await dreamQueue.pending();
      expect(pending).toHaveLength(0);
    });
  });

  describe('markFailed', () => {
    it('marks the row failed without deleting it', async () => {
      await dreamQueue.init();
      await dreamQueue.enqueue({
        localId: 'local-1',
        recordedAt: '2026-07-05T06:00:00.000Z',
        rawTranscript: 'a dream',
      });

      await dreamQueue.markFailed('local-1');

      expect(mockRows).toHaveLength(1);
      expect(mockRows[0]?.sync_status).toBe('failed');
      const pending = await dreamQueue.pending();
      expect(pending).toHaveLength(0);
    });
  });
});
