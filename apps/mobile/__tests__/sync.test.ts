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
    mockPost.mockImplementation(async (_path: string, body: { recorded_at: string }) => {
      order.push(body.recorded_at);
      return { id: `server-${order.length}` };
    });

    const result = await sync.flush();

    expect(order).toEqual(['2026-07-05T06:00:00.000Z', '2026-07-05T06:05:00.000Z']);
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockMarkSynced).toHaveBeenNthCalledWith(1, 'older', 'server-1');
    expect(mockMarkSynced).toHaveBeenNthCalledWith(2, 'newer', 'server-2');
    expect(result).toEqual({ synced: 2, failed: 0, upgradeRequired: false });
  });

  it('sends recorded_at, raw_transcript, and edited_transcript in the post body', async () => {
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
      recorded_at: '2026-07-05T06:00:00.000Z',
      raw_transcript: 'raw text',
      edited_transcript: 'edited text',
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
});
