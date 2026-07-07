// Deterministic localId generation: dreams.submit calls Crypto.randomUUID()
// once per submit to mint the offline-queue row's local_id before enqueueing.
let mockUuidCounter = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => `uuid-${++mockUuidCounter}`),
}));

const mockInit = jest.fn();
const mockEnqueue = jest.fn();
jest.mock('../src/services/dreamQueue', () => ({
  dreamQueue: {
    init: (...args: unknown[]) => mockInit(...args),
    enqueue: (...args: unknown[]) => mockEnqueue(...args),
  },
}));

const mockFlush = jest.fn();
jest.mock('../src/services/sync', () => ({
  sync: {
    flush: (...args: unknown[]) => mockFlush(...args),
  },
}));

import { dreamQueue } from '../src/services/dreamQueue';
import { dreams } from '../src/services/dreams';
import { sync } from '../src/services/sync';

describe('dreams.submit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUuidCounter = 0;
    mockInit.mockResolvedValue(undefined);
    mockEnqueue.mockResolvedValue(undefined);
  });

  it('initializes the queue and enqueues before flushing', async () => {
    const order: string[] = [];
    mockInit.mockImplementation(async () => {
      order.push('init');
    });
    mockEnqueue.mockImplementation(async () => {
      order.push('enqueue');
    });
    mockFlush.mockImplementation(async () => {
      order.push('flush');
      return { synced: 0, failed: 0, upgradeRequired: false };
    });

    await dreams.submit({
      rawTranscript: 'a dream about flying',
      recordedAt: '2026-07-05T06:00:00.000Z',
      interpret: false,
    });

    expect(order).toEqual(['init', 'enqueue', 'flush']);
  });

  it('enqueues with a generated localId, recordedAt, and rawTranscript', async () => {
    mockFlush.mockResolvedValue({ synced: 0, failed: 0, upgradeRequired: false });

    await dreams.submit({
      rawTranscript: 'a dream about flying',
      recordedAt: '2026-07-05T06:00:00.000Z',
      interpret: false,
    });

    expect(mockEnqueue).toHaveBeenCalledWith({
      localId: 'uuid-1',
      recordedAt: '2026-07-05T06:00:00.000Z',
      rawTranscript: 'a dream about flying',
    });
  });

  it('omits editedTranscript from the enqueue payload when it matches rawTranscript', async () => {
    mockFlush.mockResolvedValue({ synced: 0, failed: 0, upgradeRequired: false });

    await dreams.submit({
      rawTranscript: 'a dream about flying',
      editedTranscript: 'a dream about flying',
      recordedAt: '2026-07-05T06:00:00.000Z',
      interpret: false,
    });

    const call = mockEnqueue.mock.calls[0][0];
    expect(call).not.toHaveProperty('editedTranscript');
  });

  it('includes editedTranscript in the enqueue payload when it differs from rawTranscript', async () => {
    mockFlush.mockResolvedValue({ synced: 0, failed: 0, upgradeRequired: false });

    await dreams.submit({
      rawTranscript: 'a dream about flying',
      editedTranscript: 'a dream about soaring',
      recordedAt: '2026-07-05T06:00:00.000Z',
      interpret: false,
    });

    expect(mockEnqueue).toHaveBeenCalledWith({
      localId: 'uuid-1',
      recordedAt: '2026-07-05T06:00:00.000Z',
      rawTranscript: 'a dream about flying',
      editedTranscript: 'a dream about soaring',
    });
  });

  describe('interpret path', () => {
    it('returns { syncedId } when the row synced and interpret is true', async () => {
      mockFlush.mockImplementation(async (onSynced?: (localId: string, syncedId: string) => void) => {
        onSynced?.('uuid-1', 'server-1');
        return { synced: 1, failed: 0, upgradeRequired: false };
      });

      const result = await dreams.submit({
        rawTranscript: 'a dream about flying',
        recordedAt: '2026-07-05T06:00:00.000Z',
        interpret: true,
      });

      expect(result).toEqual({ syncedId: 'server-1' });
    });
  });

  describe('save-only path', () => {
    it('returns { saved: true } when the row synced and interpret is false', async () => {
      mockFlush.mockImplementation(async (onSynced?: (localId: string, syncedId: string) => void) => {
        onSynced?.('uuid-1', 'server-1');
        return { synced: 1, failed: 0, upgradeRequired: false };
      });

      const result = await dreams.submit({
        rawTranscript: 'a dream about flying',
        recordedAt: '2026-07-05T06:00:00.000Z',
        interpret: false,
      });

      expect(result).toEqual({ saved: true });
    });
  });

  describe('offline path', () => {
    it('returns { queued: true } when the row is not synced and no upgrade is required', async () => {
      mockFlush.mockResolvedValue({ synced: 0, failed: 0, upgradeRequired: false });

      const result = await dreams.submit({
        rawTranscript: 'a dream about flying',
        recordedAt: '2026-07-05T06:00:00.000Z',
        interpret: true,
      });

      expect(result).toEqual({ queued: true });
    });

    it('returns { queued: true } when interpret is false and the row failed to sync (network)', async () => {
      mockFlush.mockResolvedValue({ synced: 0, failed: 0, upgradeRequired: false });

      const result = await dreams.submit({
        rawTranscript: 'a dream about flying',
        recordedAt: '2026-07-05T06:00:00.000Z',
        interpret: false,
      });

      expect(result).toEqual({ queued: true });
    });
  });

  describe('402 path', () => {
    it('returns { upgradeRequired: true } when flush reports upgradeRequired', async () => {
      mockFlush.mockResolvedValue({ synced: 0, failed: 1, upgradeRequired: true });

      const result = await dreams.submit({
        rawTranscript: 'a dream about flying',
        recordedAt: '2026-07-05T06:00:00.000Z',
        interpret: true,
      });

      expect(result).toEqual({ upgradeRequired: true });
    });
  });

  describe('transcript cap', () => {
    it('throws before touching the queue when rawTranscript exceeds 5000 chars', async () => {
      const tooLong = 'a'.repeat(5001);

      await expect(
        dreams.submit({
          rawTranscript: tooLong,
          recordedAt: '2026-07-05T06:00:00.000Z',
          interpret: false,
        }),
      ).rejects.toThrow();

      expect(mockInit).not.toHaveBeenCalled();
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('throws when editedTranscript exceeds 5000 chars', async () => {
      const tooLong = 'a'.repeat(5001);

      await expect(
        dreams.submit({
          rawTranscript: 'a short dream',
          editedTranscript: tooLong,
          recordedAt: '2026-07-05T06:00:00.000Z',
          interpret: false,
        }),
      ).rejects.toThrow();

      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('allows exactly 5000 chars', async () => {
      mockFlush.mockResolvedValue({ synced: 0, failed: 0, upgradeRequired: false });
      const exactly5000 = 'a'.repeat(5000);

      await expect(
        dreams.submit({
          rawTranscript: exactly5000,
          recordedAt: '2026-07-05T06:00:00.000Z',
          interpret: false,
        }),
      ).resolves.toEqual({ queued: true });
    });
  });
});

// Keep the mocked module referenced so linting doesn't flag unused imports
// in environments that check that; both are exercised via the jest.mock
// factories above and imported here only for type-level access if needed.
void dreamQueue;
void sync;
