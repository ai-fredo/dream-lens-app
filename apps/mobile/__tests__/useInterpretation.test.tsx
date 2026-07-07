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
});
