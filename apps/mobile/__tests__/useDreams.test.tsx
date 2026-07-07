import { act, renderHook, waitFor } from '@testing-library/react-native';

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

const mockFlush = jest.fn();
jest.mock('../src/services/sync', () => ({
  sync: {
    flush: (...args: unknown[]) => mockFlush(...args),
  },
}));

const mockPending = jest.fn();
const mockEnqueue = jest.fn();
jest.mock('../src/services/dreamQueue', () => ({
  dreamQueue: {
    pending: (...args: unknown[]) => mockPending(...args),
    enqueue: (...args: unknown[]) => mockEnqueue(...args),
  },
}));

import { api } from '../src/services/api';
import { useDreamStore } from '../src/store/dreamStore';
import { useDreams } from '../src/hooks/useDreams';

const mockGet = api.get as jest.Mock;

const serverDream = {
  id: 'server-1',
  userId: 'u1',
  recordedAt: '2026-07-05T06:00:00.000Z',
  rawTranscript: 'a synced dream',
  editedTranscript: null,
  createdAt: '2026-07-05T06:00:01.000Z',
};

function resetStore() {
  useDreamStore.setState({ dreams: [], upgradeRequired: false });
}

describe('useDreams', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
    mockFlush.mockResolvedValue({ synced: 0, failed: 0, upgradeRequired: false });
    mockPending.mockResolvedValue([]);
    mockGet.mockResolvedValue([serverDream]);
  });

  it('goes from loading to ok and exposes merged dreams', async () => {
    const { result } = renderHook(() => useDreams());

    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('ok'));

    expect(result.current.dreams).toHaveLength(1);
    expect(result.current.dreams[0]).toMatchObject({ id: 'server-1', pending: false });
  });

  it('merges still-pending local rows in with a pending marker', async () => {
    mockPending.mockResolvedValue([
      {
        localId: 'local-1',
        recordedAt: '2026-07-05T06:10:00.000Z',
        rawTranscript: 'not yet synced',
        syncStatus: 'pending',
      },
    ]);

    const { result } = renderHook(() => useDreams());

    await waitFor(() => expect(result.current.status).toBe('ok'));

    const pendingEntry = result.current.dreams.find((d) => d.id === 'local-1');
    expect(pendingEntry).toMatchObject({ pending: true, rawTranscript: 'not yet synced' });
  });

  it('surfaces an error status and retry flips back to ok on success', async () => {
    mockGet.mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(() => useDreams());

    await waitFor(() => expect(result.current.status).toBe('error'));

    mockGet.mockResolvedValue([serverDream]);
    await act(async () => {
      await result.current.retry();
    });

    expect(result.current.status).toBe('ok');
    expect(result.current.dreams).toHaveLength(1);
  });
});

describe('useDreamStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
    mockFlush.mockResolvedValue({ synced: 0, failed: 0, upgradeRequired: false });
    mockPending.mockResolvedValue([]);
    mockGet.mockResolvedValue([]);
  });

  it('refresh() flushes the queue before fetching the server list', async () => {
    const callOrder: string[] = [];
    mockFlush.mockImplementation(async () => {
      callOrder.push('flush');
      return { synced: 0, failed: 0, upgradeRequired: false };
    });
    mockGet.mockImplementation(async () => {
      callOrder.push('get');
      return [];
    });

    await useDreamStore.getState().refresh();

    expect(callOrder).toEqual(['flush', 'get']);
  });

  it('refresh() sets upgradeRequired when flush reports it', async () => {
    mockFlush.mockResolvedValue({ synced: 0, failed: 1, upgradeRequired: true });

    await useDreamStore.getState().refresh();

    expect(useDreamStore.getState().upgradeRequired).toBe(true);
  });

  it('addLocal enqueues the dream and adds it to state as pending', async () => {
    mockEnqueue.mockResolvedValue(undefined);

    await useDreamStore.getState().addLocal({
      localId: 'local-9',
      recordedAt: '2026-07-05T06:00:00.000Z',
      rawTranscript: 'a fresh dream',
    });

    expect(mockEnqueue).toHaveBeenCalledWith({
      localId: 'local-9',
      recordedAt: '2026-07-05T06:00:00.000Z',
      rawTranscript: 'a fresh dream',
    });
    const state = useDreamStore.getState();
    expect(state.dreams.find((d) => d.id === 'local-9')).toMatchObject({ pending: true });
  });
});
