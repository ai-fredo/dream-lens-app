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

const mockInterpretationReady = jest.fn();
jest.mock('../src/services/haptics', () => ({
  haptics: {
    recordStart: jest.fn(),
    recordStop: jest.fn(),
    interpretationReady: (...args: unknown[]) => mockInterpretationReady(...args),
    error: jest.fn(),
    buttonPress: jest.fn(),
  },
}));

import { api } from '../src/services/api';
import { useInterpretation } from '../src/hooks/useInterpretation';

const mockGet = api.get as jest.Mock;
const mockPost = api.post as jest.Mock;

const baseDream = {
  id: 'dream-1',
  userId: 'u1',
  recordedAt: '2026-07-04T13:23:00.000Z',
  rawTranscript: 'I was flying over the ocean',
  editedTranscript: null,
  createdAt: '2026-07-04T13:24:00.000Z',
};

const camelInterpretation = {
  summary: 'A dream about flight and freedom.',
  themes: ['Freedom', 'Escape'],
  symbols: [{ symbol: 'Ocean', interpretation: 'The vastness of the unknown.' }],
  emotionalTone: 'peaceful',
  patternNote: null,
  questionsToReflectOn: ['What are you trying to escape from?'],
};

describe('useInterpretation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts in loading status', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useInterpretation('dream-1'));
    expect(result.current.status).toBe('loading');
  });

  it('fetches the dream and, when already interpreted, does not call interpret', async () => {
    mockGet.mockResolvedValue({ ...baseDream, interpretation: camelInterpretation });

    const { result } = renderHook(() => useInterpretation('dream-1'));

    await waitFor(() => expect(result.current.status).toBe('ok'));

    expect(mockGet).toHaveBeenCalledWith('/v1/dreams/dream-1');
    expect(mockPost).not.toHaveBeenCalled();
    expect(result.current.dream?.interpretation?.summary).toBe('A dream about flight and freedom.');
  });

  it('calls interpret when the dream has no interpretation yet, then merges the result', async () => {
    mockGet.mockResolvedValue({ ...baseDream, interpretation: null });
    mockPost.mockResolvedValue(camelInterpretation);

    const { result } = renderHook(() => useInterpretation('dream-1'));

    await waitFor(() => expect(result.current.status).toBe('ok'));

    expect(mockPost).toHaveBeenCalledWith('/v1/dreams/dream-1/interpret');
    expect(result.current.dream?.interpretation?.summary).toBe('A dream about flight and freedom.');
    expect(result.current.dream?.interpretation?.themes).toEqual(['Freedom', 'Escape']);
  });

  it('fires haptics.interpretationReady exactly once on success', async () => {
    mockGet.mockResolvedValue({ ...baseDream, interpretation: camelInterpretation });

    const { result } = renderHook(() => useInterpretation('dream-1'));

    await waitFor(() => expect(result.current.status).toBe('ok'));

    expect(mockInterpretationReady).toHaveBeenCalledTimes(1);
  });

  it('normalizes snake_case interpretation fields from the GET payload into camelCase', async () => {
    mockGet.mockResolvedValue({
      ...baseDream,
      interpretation: {
        summary: 'Snake case summary.',
        themes: ['Theme A'],
        symbols: [{ symbol: 'Door', interpretation: 'A threshold.' }],
        emotional_tone: 'anxious',
        pattern_note: 'You keep dreaming of doors.',
        questions_to_reflect_on: ['Why doors?'],
      },
    });

    const { result } = renderHook(() => useInterpretation('dream-1'));

    await waitFor(() => expect(result.current.status).toBe('ok'));

    expect(result.current.dream?.interpretation).toMatchObject({
      summary: 'Snake case summary.',
      emotionalTone: 'anxious',
      patternNote: 'You keep dreaming of doors.',
      questionsToReflectOn: ['Why doors?'],
    });
  });

  it('normalizes a snake_case POST /interpret response the same way', async () => {
    mockGet.mockResolvedValue({ ...baseDream, interpretation: null });
    mockPost.mockResolvedValue({
      summary: 'From interpret endpoint.',
      themes: ['Theme B'],
      symbols: [],
      emotional_tone: 'urgent',
      pattern_note: null,
      questions_to_reflect_on: ['What is chasing you?'],
    });

    const { result } = renderHook(() => useInterpretation('dream-1'));

    await waitFor(() => expect(result.current.status).toBe('ok'));

    expect(result.current.dream?.interpretation).toMatchObject({
      summary: 'From interpret endpoint.',
      emotionalTone: 'urgent',
      patternNote: null,
      questionsToReflectOn: ['What is chasing you?'],
    });
  });

  it('with interpretIfMissing: false, leaves an uninterpreted dream as-is and never calls interpret', async () => {
    mockGet.mockResolvedValue({ ...baseDream, interpretation: null });

    const { result } = renderHook(() => useInterpretation('dream-1', { interpretIfMissing: false }));

    await waitFor(() => expect(result.current.status).toBe('ok'));

    expect(mockPost).not.toHaveBeenCalled();
    expect(result.current.dream?.interpretation).toBeNull();
    expect(mockInterpretationReady).not.toHaveBeenCalled();
  });

  it('with interpretIfMissing: false, still surfaces an already-interpreted dream normally', async () => {
    mockGet.mockResolvedValue({ ...baseDream, interpretation: camelInterpretation });

    const { result } = renderHook(() => useInterpretation('dream-1', { interpretIfMissing: false }));

    await waitFor(() => expect(result.current.status).toBe('ok'));

    expect(mockPost).not.toHaveBeenCalled();
    expect(result.current.dream?.interpretation?.summary).toBe('A dream about flight and freedom.');
  });

  it('surfaces an error status when the GET fails', async () => {
    mockGet.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useInterpretation('dream-1'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(mockInterpretationReady).not.toHaveBeenCalled();
  });

  it('surfaces an error status when interpret fails', async () => {
    mockGet.mockResolvedValue({ ...baseDream, interpretation: null });
    mockPost.mockRejectedValue(new Error('claude down'));

    const { result } = renderHook(() => useInterpretation('dream-1'));

    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('retry re-runs the whole fetch/interpret flow and can recover from error', async () => {
    mockGet.mockRejectedValueOnce(new Error('network down'));

    const { result } = renderHook(() => useInterpretation('dream-1'));

    await waitFor(() => expect(result.current.status).toBe('error'));

    mockGet.mockResolvedValue({ ...baseDream, interpretation: camelInterpretation });
    await act(async () => {
      await result.current.retry();
    });

    expect(result.current.status).toBe('ok');
    expect(result.current.dream?.interpretation?.summary).toBe('A dream about flight and freedom.');
  });

  it('unmounting mid-flight does not update state after unmount (no act warnings)', async () => {
    let resolveGet: (value: unknown) => void = () => {};
    mockGet.mockReturnValue(
      new Promise((resolve) => {
        resolveGet = resolve;
      }),
    );

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result, unmount } = renderHook(() => useInterpretation('dream-1'));
    expect(result.current.status).toBe('loading');

    unmount();

    // Resolve the in-flight GET only after unmount — the load-token guard
    // should prevent any setState call from firing (and thus no React "state
    // update on an unmounted component" warning).
    await act(async () => {
      resolveGet({ ...baseDream, interpretation: camelInterpretation });
      // Flush microtasks so the (guarded) .then chain in load() runs.
      await Promise.resolve();
      await Promise.resolve();
    });

    const actWarnings = errorSpy.mock.calls.filter((args) =>
      String(args[0]).includes("Can't perform a React state update"),
    );
    expect(actWarnings).toHaveLength(0);

    errorSpy.mockRestore();
  });

  it('discards a stale in-flight response when dreamId changes mid-flight', async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    let resolveSecond: (value: unknown) => void = () => {};

    mockGet.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );

    const { result, rerender } = renderHook(
      ({ dreamId }: { dreamId: string }) => useInterpretation(dreamId),
      { initialProps: { dreamId: 'dream-1' } },
    );

    mockGet.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
    );

    // Switch to a new dreamId before the first GET resolves — this re-runs
    // the effect (new `load` identity) and bumps the load token, so the
    // first response should be discarded even though it resolves later.
    rerender({ dreamId: 'dream-2' });

    await act(async () => {
      resolveSecond({
        ...baseDream,
        id: 'dream-2',
        interpretation: { ...camelInterpretation, summary: 'Second, newer response.' },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.status).toBe('ok'));
    expect(result.current.dream?.id).toBe('dream-2');
    expect(result.current.dream?.interpretation?.summary).toBe('Second, newer response.');

    // Now resolve the stale first response — it must not clobber the newer state.
    await act(async () => {
      resolveFirst({ ...baseDream, id: 'dream-1', interpretation: camelInterpretation });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.dream?.id).toBe('dream-2');
    expect(result.current.dream?.interpretation?.summary).toBe('Second, newer response.');
  });
});
