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

import { api } from '../src/services/api';
import { usePatterns } from '../src/hooks/usePatterns';

const mockGet = api.get as jest.Mock;
const mockPost = api.post as jest.Mock;

const rawSummary = {
  summary: {
    totalDreams: 12,
    recurringSymbols: [
      { symbol: 'Ocean', count: 5 },
      { symbol: 'Flying', count: 3 },
    ],
    dominantEmotionalTone: 'anxious',
  },
  emotionArc: [
    { date: '2026-07-01', emotionalTone: 'anxious' },
    { date: '2026-07-02', emotionalTone: 'peaceful' },
  ],
  clusters: [
    { id: 'c1', label: 'Dreams of Ocean', topSymbols: ['Ocean', 'Water'], dreamCount: 4 },
  ],
  insights: [
    { id: 'i1', title: 'A recurring theme', body: 'You keep dreaming of water.', created_at: '2026-07-01T00:00:00.000Z', seen_at: null },
    { id: 'i2', title: 'Already seen', body: 'Old news.', created_at: '2026-06-01T00:00:00.000Z', seen_at: '2026-06-02T00:00:00.000Z' },
  ],
};

describe('usePatterns', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts in loading status', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => usePatterns());
    expect(result.current.status).toBe('loading');
  });

  it('fetches GET /v1/profile/summary and normalizes snake_case insight fields to camelCase', async () => {
    mockGet.mockResolvedValue(rawSummary);

    const { result } = renderHook(() => usePatterns());

    await waitFor(() => expect(result.current.status).toBe('ok'));

    expect(mockGet).toHaveBeenCalledWith('/v1/profile/summary');
    expect(result.current.data?.summary.totalDreams).toBe(12);
    expect(result.current.data?.summary.recurringSymbols).toEqual([
      { label: 'Ocean', count: 5 },
      { label: 'Flying', count: 3 },
    ]);
    expect(result.current.data?.summary.dominantTone).toBe('anxious');
    expect(result.current.data?.emotionArc).toEqual([
      { date: '2026-07-01', tone: 'anxious' },
      { date: '2026-07-02', tone: 'peaceful' },
    ]);
    expect(result.current.data?.clusters).toEqual([
      { id: 'c1', label: 'Dreams of Ocean', topSymbols: ['Ocean', 'Water'], dreamCount: 4 },
    ]);
    expect(result.current.data?.insights).toEqual([
      { id: 'i1', title: 'A recurring theme', body: 'You keep dreaming of water.', seenAt: null },
      { id: 'i2', title: 'Already seen', body: 'Old news.', seenAt: '2026-06-02T00:00:00.000Z' },
    ]);
  });

  it('sets status to error when the fetch fails', async () => {
    mockGet.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => usePatterns());

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.data).toBeNull();
  });

  it('retry re-fetches and can recover from error to ok', async () => {
    mockGet.mockRejectedValueOnce(new Error('network down'));
    mockGet.mockResolvedValueOnce(rawSummary);

    const { result } = renderHook(() => usePatterns());
    await waitFor(() => expect(result.current.status).toBe('error'));

    await act(async () => {
      await result.current.retry();
    });

    await waitFor(() => expect(result.current.status).toBe('ok'));
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('markSeen POSTs /v1/insights/:id/seen for an unseen insight and flips it locally', async () => {
    mockGet.mockResolvedValue(rawSummary);
    mockPost.mockResolvedValue({ id: 'i1' });

    const { result } = renderHook(() => usePatterns());
    await waitFor(() => expect(result.current.status).toBe('ok'));

    await act(async () => {
      await result.current.markSeen('i1');
    });

    expect(mockPost).toHaveBeenCalledWith('/v1/insights/i1/seen');
    expect(mockPost).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(result.current.data?.insights.find((i) => i.id === 'i1')?.seenAt).not.toBeNull(),
    );
  });

  it('markSeen swallows POST failures silently but still flips the local seen flag', async () => {
    mockGet.mockResolvedValue(rawSummary);
    mockPost.mockRejectedValue(new Error('server exploded'));

    const { result } = renderHook(() => usePatterns());
    await waitFor(() => expect(result.current.status).toBe('ok'));

    await act(async () => {
      await expect(result.current.markSeen('i1')).resolves.toBeUndefined();
    });

    await waitFor(() =>
      expect(result.current.data?.insights.find((i) => i.id === 'i1')?.seenAt).not.toBeNull(),
    );
  });
});
