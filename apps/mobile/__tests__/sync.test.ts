jest.mock('../src/services/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    del: jest.fn(),
  },
  ApiError: class ApiError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

const mockPending = jest.fn();
const mockMarkSynced = jest.fn();
const mockMarkFailed = jest.fn();
jest.mock('../src/services/dreamQueue', () => ({
  dreamQueue: {
    pending: (...args: unknown[]) => mockPending(...args),
    markSynced: (...args: unknown[]) => mockMarkSynced(...args),
    markFailed: (...args: unknown[]) => mockMarkFailed(...args),
  },
}));

import { api, ApiError } from '../src/services/api';
import { sync } from '../src/services/sync';

const mockPost = api.post as jest.Mock;

describe('sync.flush', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('posts pending rows oldest first, serially', async () => {
    const order: string[] = [];
    mockPending.mockResolvedValue([
      { localId: 'older', recordedAt: '2026-07-05T06:00:00.000Z', rawTranscript: 'first', syncStatus: 'pending' },
      { localId: 'newer', recordedAt: '2026-07-05T06:05:00.000Z', rawTranscript: 'second', syncStatus: 'pending' },
    ]);
    mockPost.mockImplementation(async (_path: string, body: { recordedAt: string }) => {
      order.push(body.recordedAt);
      return { id: `server-${order.length}` };
    });

    const result = await sync.flush();

    expect(order).toEqual(['2026-07-05T06:00:00.000Z', '2026-07-05T06:05:00.000Z']);
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockMarkSynced).toHaveBeenNthCalledWith(1, 'older', 'server-1');
    expect(mockMarkSynced).toHaveBeenNthCalledWith(2, 'newer', 'server-2');
    expect(result).toEqual({ synced: 2, failed: 0, upgradeRequired: false });
  });

  it('sends recordedAt, rawTranscript, and editedTranscript in the post body', async () => {
    mockPending.mockResolvedValue([
      {
        localId: 'local-1',
        recordedAt: '2026-07-05T06:00:00.000Z',
        rawTranscript: 'raw text',
        editedTranscript: 'edited text',
        syncStatus: 'pending',
      },
    ]);
    mockPost.mockResolvedValue({ id: 'server-1' });

    await sync.flush();

    expect(mockPost).toHaveBeenCalledWith('/v1/dreams', {
      recordedAt: '2026-07-05T06:00:00.000Z',
      rawTranscript: 'raw text',
      editedTranscript: 'edited text',
    });
  });

  it('sets upgradeRequired and does not retry that row on a 402 UPGRADE_REQUIRED error', async () => {
    mockPending.mockResolvedValue([
      { localId: 'local-1', recordedAt: '2026-07-05T06:00:00.000Z', rawTranscript: 'a dream', syncStatus: 'pending' },
    ]);
    mockPost.mockRejectedValue(new ApiError('UPGRADE_REQUIRED', 'Upgrade to continue.', 402));

    const result = await sync.flush();

    expect(mockMarkFailed).toHaveBeenCalledWith('local-1');
    expect(mockMarkSynced).not.toHaveBeenCalled();
    expect(result).toEqual({ synced: 0, failed: 1, upgradeRequired: true });
  });

  it('leaves the row pending on a network error, without marking synced or failed', async () => {
    mockPending.mockResolvedValue([
      { localId: 'local-1', recordedAt: '2026-07-05T06:00:00.000Z', rawTranscript: 'a dream', syncStatus: 'pending' },
    ]);
    mockPost.mockRejectedValue(new ApiError('NETWORK', "Can't connect right now.", 0));

    const result = await sync.flush();

    expect(mockMarkSynced).not.toHaveBeenCalled();
    expect(mockMarkFailed).not.toHaveBeenCalled();
    expect(result).toEqual({ synced: 0, failed: 0, upgradeRequired: false });
  });

  it('continues processing remaining rows after a network error on one row', async () => {
    mockPending.mockResolvedValue([
      { localId: 'fails', recordedAt: '2026-07-05T06:00:00.000Z', rawTranscript: 'a', syncStatus: 'pending' },
      { localId: 'succeeds', recordedAt: '2026-07-05T06:05:00.000Z', rawTranscript: 'b', syncStatus: 'pending' },
    ]);
    mockPost
      .mockRejectedValueOnce(new ApiError('NETWORK', "Can't connect right now.", 0))
      .mockResolvedValueOnce({ id: 'server-2' });

    const result = await sync.flush();

    expect(mockMarkSynced).toHaveBeenCalledWith('succeeds', 'server-2');
    expect(result).toEqual({ synced: 1, failed: 0, upgradeRequired: false });
  });

  it('returns zeros when there is nothing pending', async () => {
    mockPending.mockResolvedValue([]);

    const result = await sync.flush();

    expect(mockPost).not.toHaveBeenCalled();
    expect(result).toEqual({ synced: 0, failed: 0, upgradeRequired: false });
  });

  describe('onSynced callback', () => {
    it('fires once per successfully-synced row with its (localId, syncedId) pair, without changing the return shape', async () => {
      mockPending.mockResolvedValue([
        { localId: 'local-1', recordedAt: '2026-07-05T06:00:00.000Z', rawTranscript: 'a', syncStatus: 'pending' },
        { localId: 'local-2', recordedAt: '2026-07-05T06:05:00.000Z', rawTranscript: 'b', syncStatus: 'pending' },
      ]);
      mockPost.mockResolvedValueOnce({ id: 'server-1' }).mockResolvedValueOnce({ id: 'server-2' });

      const onSynced = jest.fn();
      const result = await sync.flush(onSynced);

      expect(onSynced).toHaveBeenNthCalledWith(1, 'local-1', 'server-1');
      expect(onSynced).toHaveBeenNthCalledWith(2, 'local-2', 'server-2');
      expect(result).toEqual({ synced: 2, failed: 0, upgradeRequired: false });
    });

    it('does not fire for a row that fails with a network error', async () => {
      mockPending.mockResolvedValue([
        { localId: 'local-1', recordedAt: '2026-07-05T06:00:00.000Z', rawTranscript: 'a', syncStatus: 'pending' },
      ]);
      mockPost.mockRejectedValue(new ApiError('NETWORK', "Can't connect right now.", 0));

      const onSynced = jest.fn();
      await sync.flush(onSynced);

      expect(onSynced).not.toHaveBeenCalled();
    });

    it('does not fire for a row that fails with UPGRADE_REQUIRED', async () => {
      mockPending.mockResolvedValue([
        { localId: 'local-1', recordedAt: '2026-07-05T06:00:00.000Z', rawTranscript: 'a', syncStatus: 'pending' },
      ]);
      mockPost.mockRejectedValue(new ApiError('UPGRADE_REQUIRED', 'Upgrade to continue.', 402));

      const onSynced = jest.fn();
      await sync.flush(onSynced);

      expect(onSynced).not.toHaveBeenCalled();
    });

    it('works normally when omitted (backward compatible)', async () => {
      mockPending.mockResolvedValue([
        { localId: 'local-1', recordedAt: '2026-07-05T06:00:00.000Z', rawTranscript: 'a', syncStatus: 'pending' },
      ]);
      mockPost.mockResolvedValue({ id: 'server-1' });

      await expect(sync.flush()).resolves.toEqual({ synced: 1, failed: 0, upgradeRequired: false });
    });
  });

  describe('POST /v1/dreams body contract', () => {
    // Mirrors apps/api/src/validation/schemas.ts CreateDreamSchema, whose
    // required/optional keys are the actual contract for this endpoint:
    //
    //   export const CreateDreamSchema = z.object({
    //     rawTranscript: z.string().min(10).max(5000).trim(),
    //     editedTranscript: z.string().max(5000).trim().nullable().optional(),
    //     recordedAt: z.string().datetime(),
    //   });
    //
    // A direct cross-workspace import of that schema isn't practical here:
    // apps/mobile runs under jest-expo (transformIgnorePatterns tuned for
    // RN packages) and does not depend on `zod` or express types that
    // apps/api's schemas.ts pulls in. Instead we pin the exact key set and
    // casing as a fixture so this test fails loudly if sync.ts regresses to
    // snake_case (or otherwise drifts from the API contract).
    const REQUIRED_KEYS = ['recordedAt', 'rawTranscript'] as const;
    const OPTIONAL_KEYS = ['editedTranscript'] as const;
    const FORBIDDEN_SNAKE_CASE_KEYS = ['recorded_at', 'raw_transcript', 'edited_transcript'];

    it('POSTs a body with exactly the CreateDreamSchema-shaped camelCase keys (no editedTranscript)', async () => {
      mockPending.mockResolvedValue([
        {
          localId: 'local-1',
          recordedAt: '2026-07-05T06:00:00.000Z',
          rawTranscript: 'a dream about flying',
          syncStatus: 'pending',
        },
      ]);
      mockPost.mockResolvedValue({ id: 'server-1' });

      await sync.flush();

      expect(mockPost).toHaveBeenCalledTimes(1);
      const [path, body] = mockPost.mock.calls[0];
      expect(path).toBe('/v1/dreams');

      for (const key of REQUIRED_KEYS) {
        expect(body).toHaveProperty(key);
      }
      expect(typeof body.recordedAt).toBe('string');
      expect(() => new Date(body.recordedAt).toISOString()).not.toThrow();
      expect(typeof body.rawTranscript).toBe('string');

      // editedTranscript was not set on the queued row, so it must be omitted.
      expect(body).not.toHaveProperty('editedTranscript');

      for (const key of FORBIDDEN_SNAKE_CASE_KEYS) {
        expect(body).not.toHaveProperty(key);
      }
    });

    it('includes editedTranscript only when the queued row has one set', async () => {
      mockPending.mockResolvedValue([
        {
          localId: 'local-1',
          recordedAt: '2026-07-05T06:00:00.000Z',
          rawTranscript: 'a dream about flying',
          editedTranscript: 'a dream about soaring',
          syncStatus: 'pending',
        },
      ]);
      mockPost.mockResolvedValue({ id: 'server-1' });

      await sync.flush();

      const [, body] = mockPost.mock.calls[0];
      for (const key of [...REQUIRED_KEYS, ...OPTIONAL_KEYS]) {
        expect(body).toHaveProperty(key);
      }
      expect(typeof body.editedTranscript).toBe('string');
      expect(body.editedTranscript).toBe('a dream about soaring');

      for (const key of FORBIDDEN_SNAKE_CASE_KEYS) {
        expect(body).not.toHaveProperty(key);
      }
    });
  });

  describe('re-entrancy guard', () => {
    it('calling flush() twice without awaiting the first POSTs each pending row exactly once and returns the same result to both callers', async () => {
      mockPending.mockResolvedValue([
        { localId: 'local-1', recordedAt: '2026-07-05T06:00:00.000Z', rawTranscript: 'a', syncStatus: 'pending' },
        { localId: 'local-2', recordedAt: '2026-07-05T06:05:00.000Z', rawTranscript: 'b', syncStatus: 'pending' },
      ]);

      let resolvePost1: (v: { id: string }) => void;
      let resolvePost2: (v: { id: string }) => void;
      const post1 = new Promise<{ id: string }>((resolve) => {
        resolvePost1 = resolve;
      });
      const post2 = new Promise<{ id: string }>((resolve) => {
        resolvePost2 = resolve;
      });
      mockPost.mockImplementationOnce(() => post1).mockImplementationOnce(() => post2);

      const call1 = sync.flush();
      const call2 = sync.flush();

      // Let pending() microtasks resolve, then release the mocked POSTs.
      await Promise.resolve();
      await Promise.resolve();
      resolvePost1!({ id: 'server-1' });
      resolvePost2!({ id: 'server-2' });

      const [result1, result2] = await Promise.all([call1, call2]);

      // dreamQueue.pending() itself is only consulted once: the second
      // caller is handed the first call's in-flight promise rather than
      // starting a fresh pass.
      expect(mockPending).toHaveBeenCalledTimes(1);
      expect(mockPost).toHaveBeenCalledTimes(2);
      expect(mockMarkSynced).toHaveBeenCalledWith('local-1', 'server-1');
      expect(mockMarkSynced).toHaveBeenCalledWith('local-2', 'server-2');
      expect(mockMarkSynced).toHaveBeenCalledTimes(2);

      expect(result1).toEqual({ synced: 2, failed: 0, upgradeRequired: false });
      expect(result2).toBe(result1);
    });

    it('allows a new flush() after the in-flight one settles', async () => {
      mockPending.mockResolvedValueOnce([
        { localId: 'local-1', recordedAt: '2026-07-05T06:00:00.000Z', rawTranscript: 'a', syncStatus: 'pending' },
      ]);
      mockPost.mockResolvedValueOnce({ id: 'server-1' });

      await sync.flush();

      mockPending.mockResolvedValueOnce([
        { localId: 'local-2', recordedAt: '2026-07-05T06:05:00.000Z', rawTranscript: 'b', syncStatus: 'pending' },
      ]);
      mockPost.mockResolvedValueOnce({ id: 'server-2' });

      await sync.flush();

      expect(mockPending).toHaveBeenCalledTimes(2);
      expect(mockPost).toHaveBeenCalledTimes(2);
      expect(mockMarkSynced).toHaveBeenNthCalledWith(1, 'local-1', 'server-1');
      expect(mockMarkSynced).toHaveBeenNthCalledWith(2, 'local-2', 'server-2');
    });
  });
});
