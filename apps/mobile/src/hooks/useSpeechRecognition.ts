import { useCallback, useRef, useState } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionResultEvent,
} from 'expo-speech-recognition';
import { haptics } from '../services/haptics';

export type SpeechRecognitionState = 'idle' | 'listening' | 'stopped' | 'denied' | 'unavailable';

export interface UseSpeechRecognitionResult {
  state: SpeechRecognitionState;
  transcript: string;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

/**
 * Streaming speech-to-text for the RecordScreen, backed by
 * expo-speech-recognition. `start()` requests mic + speech permission first;
 * a denial moves to `'denied'` (caller routes to PermissionExplainScreen), and
 * an unavailable recognizer (no Siri/Dictation, no Android speech service)
 * moves to `'unavailable'` without ever prompting for permission (caller
 * falls back to a "Type instead" affordance).
 *
 * Partial results stream into `transcript` as they arrive. An `end` event
 * while listening — whether from an explicit `stop()` or an interruption
 * (e.g. an incoming phone call) — moves to `'stopped'` and preserves
 * whatever transcript had been captured so far.
 */
export function useSpeechRecognition(): UseSpeechRecognitionResult {
  const [state, setState] = useState<SpeechRecognitionState>('idle');
  const [transcript, setTranscript] = useState('');
  // Tracks whether we're in a listening session so the "end" event (which
  // fires both for user-initiated stop and for interruptions) knows whether
  // to transition to 'stopped'. Using a ref avoids a stale closure inside
  // the native event handler.
  const listeningRef = useRef(false);

  useSpeechRecognitionEvent('result', (event: ExpoSpeechRecognitionResultEvent) => {
    const next = event.results[0]?.transcript;
    if (typeof next === 'string') {
      setTranscript(next);
    }
  });

  useSpeechRecognitionEvent('end', () => {
    if (listeningRef.current) {
      listeningRef.current = false;
      setState('stopped');
    }
  });

  useSpeechRecognitionEvent('error', () => {
    listeningRef.current = false;
    haptics.error();
    setState('idle');
  });

  const start = useCallback(async () => {
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setState('unavailable');
      return;
    }

    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setState('denied');
      return;
    }

    setTranscript('');
    listeningRef.current = true;
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: true,
    });
    setState('listening');
    haptics.recordStart();
  }, []);

  const stop = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
    haptics.recordStop();
  }, []);

  const reset = useCallback(() => {
    listeningRef.current = false;
    setState('idle');
    setTranscript('');
  }, []);

  return { state, transcript, start, stop, reset };
}
