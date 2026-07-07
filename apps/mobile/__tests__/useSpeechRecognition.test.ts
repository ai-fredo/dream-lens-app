import { act, renderHook, waitFor } from '@testing-library/react-native';

// --- expo-speech-recognition mock -----------------------------------------
// The hook consumes ExpoSpeechRecognitionModule (start/stop/requestPermissionsAsync/
// isRecognitionAvailable) plus the "result"/"end"/"error" events. We model the
// native event emitter with a tiny in-test bus so tests can fire events the
// same way the native module would via useSpeechRecognitionEvent.
type Listener = (event: unknown) => void;
const listeners: Record<string, Listener[]> = {};

function emit(type: string, event: unknown) {
  (listeners[type] ?? []).forEach((fn) => fn(event));
}

const mockStart = jest.fn();
const mockStop = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
let mockIsRecognitionAvailable = jest.fn(() => true);

jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    start: (...args: unknown[]) => mockStart(...args),
    stop: (...args: unknown[]) => mockStop(...args),
    requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissionsAsync(...args),
    isRecognitionAvailable: () => mockIsRecognitionAvailable(),
  },
  useSpeechRecognitionEvent: (type: string, handler: Listener) => {
    const React = require('react');
    React.useEffect(() => {
      listeners[type] = listeners[type] ?? [];
      listeners[type].push(handler);
      return () => {
        listeners[type] = (listeners[type] ?? []).filter((fn) => fn !== handler);
      };
    });
  },
}));

const mockHapticsRecordStart = jest.fn();
const mockHapticsRecordStop = jest.fn();
const mockHapticsError = jest.fn();
jest.mock('../src/services/haptics', () => ({
  haptics: {
    recordStart: (...args: unknown[]) => mockHapticsRecordStart(...args),
    recordStop: (...args: unknown[]) => mockHapticsRecordStop(...args),
    interpretationReady: jest.fn(),
    error: (...args: unknown[]) => mockHapticsError(...args),
    buttonPress: jest.fn(),
  },
}));

import { useSpeechRecognition } from '../src/hooks/useSpeechRecognition';

describe('useSpeechRecognition', () => {
  beforeEach(() => {
    Object.keys(listeners).forEach((key) => delete listeners[key]);
    mockStart.mockReset();
    mockStop.mockReset();
    mockRequestPermissionsAsync.mockReset();
    mockRequestPermissionsAsync.mockResolvedValue({ granted: true });
    mockIsRecognitionAvailable = jest.fn(() => true);
    mockHapticsRecordStart.mockReset();
    mockHapticsRecordStop.mockReset();
    mockHapticsError.mockReset();
  });

  it('starts in idle state with an empty transcript', () => {
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.state).toBe('idle');
    expect(result.current.transcript).toBe('');
  });

  it('start() requests permission and transitions to listening when granted', async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.start();
    });

    expect(mockRequestPermissionsAsync).toHaveBeenCalled();
    expect(mockStart).toHaveBeenCalled();
    expect(result.current.state).toBe('listening');
    expect(mockHapticsRecordStart).toHaveBeenCalled();
  });

  it('appends streaming partial results into transcript while listening', async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.start();
    });

    act(() => {
      emit('result', { results: [{ transcript: 'I was flying' }], isFinal: false });
    });

    await waitFor(() => {
      expect(result.current.transcript).toBe('I was flying');
    });

    act(() => {
      emit('result', { results: [{ transcript: 'I was flying over the ocean' }], isFinal: false });
    });

    await waitFor(() => {
      expect(result.current.transcript).toBe('I was flying over the ocean');
    });
  });

  it('stop() calls the native stop and transitions to stopped', async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.start();
    });

    act(() => {
      result.current.stop();
    });

    expect(mockStop).toHaveBeenCalled();

    act(() => {
      emit('end', {});
    });

    await waitFor(() => {
      expect(result.current.state).toBe('stopped');
    });
    expect(mockHapticsRecordStop).toHaveBeenCalled();
  });

  it('start() is a no-op re-entrancy guard when already listening: native start called once, transcript preserved', async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.start();
    });

    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockRequestPermissionsAsync).toHaveBeenCalledTimes(1);

    act(() => {
      emit('result', { results: [{ transcript: 'a recurring dream' }], isFinal: false });
    });

    await waitFor(() => {
      expect(result.current.transcript).toBe('a recurring dream');
    });

    // Calling start() again while already listening must not reset the
    // transcript or re-invoke the native module.
    await act(async () => {
      await result.current.start();
    });

    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockRequestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('listening');
    expect(result.current.transcript).toBe('a recurring dream');
  });

  it('denied permission transitions to denied state', async () => {
    mockRequestPermissionsAsync.mockResolvedValue({ granted: false });
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.state).toBe('denied');
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('unavailable recognizer transitions to unavailable state without requesting permission', async () => {
    mockIsRecognitionAvailable = jest.fn(() => false);
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.state).toBe('unavailable');
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('handles interruption: an "end" event while listening keeps the transcript and moves to stopped', async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.start();
    });

    act(() => {
      emit('result', { results: [{ transcript: 'a partial thought' }], isFinal: false });
    });

    await waitFor(() => {
      expect(result.current.transcript).toBe('a partial thought');
    });

    // Interruption: native "end" fires without the caller having called stop().
    act(() => {
      emit('end', {});
    });

    await waitFor(() => {
      expect(result.current.state).toBe('stopped');
    });
    expect(result.current.transcript).toBe('a partial thought');
  });

  it('an "error" event surfaces the error haptic and resets to idle', async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.start();
    });

    act(() => {
      emit('error', { error: 'audio-capture', message: 'Mic failure' });
    });

    await waitFor(() => {
      expect(mockHapticsError).toHaveBeenCalled();
    });
  });

  it('reset() clears the transcript and returns to idle', async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.start();
    });

    act(() => {
      emit('result', { results: [{ transcript: 'something' }], isFinal: false });
    });

    await waitFor(() => {
      expect(result.current.transcript).toBe('something');
    });

    act(() => {
      result.current.stop();
      emit('end', {});
    });

    await waitFor(() => {
      expect(result.current.state).toBe('stopped');
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.state).toBe('idle');
    expect(result.current.transcript).toBe('');
  });
});
