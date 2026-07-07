import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { haptics } from '../services/haptics';

export interface SymbolInterpretation {
  symbol: string;
  interpretation: string;
}

/** Normalized (camelCase-only) interpretation shape screens consume. */
export interface Interpretation {
  summary: string;
  themes: string[];
  symbols: SymbolInterpretation[];
  emotionalTone: string;
  patternNote: string | null;
  questionsToReflectOn: string[];
}

export interface InterpretedDream {
  id: string;
  recordedAt: string;
  rawTranscript: string;
  editedTranscript: string | null;
  interpretation: Interpretation | null;
}

export type InterpretationStatus = 'loading' | 'ok' | 'error';

export interface UseInterpretationResult {
  status: InterpretationStatus;
  dream: InterpretedDream | null;
  retry: () => Promise<void>;
}

/** Raw shapes this mapper accepts — the server DTO documents camelCase, but
 * this normalizer is defensive: it accepts either casing for every field
 * that has a snake_case sibling (emotional_tone, pattern_note,
 * questions_to_reflect_on) so screens never have to think about it. */
interface RawInterpretationInput {
  summary: string;
  themes: string[];
  symbols: SymbolInterpretation[];
  emotionalTone?: string;
  emotional_tone?: string;
  patternNote?: string | null;
  pattern_note?: string | null;
  questionsToReflectOn?: string[];
  questions_to_reflect_on?: string[];
}

/**
 * Normalizes a raw interpretation payload — whether it came back
 * camelCase (the API's documented shape) or snake_case (defensive, in case
 * a caller forwards the raw DB row) — into the single camelCase shape every
 * screen consumes. This is the ONE mapper for this concern; nothing else in
 * the app should branch on field casing.
 */
function normalizeInterpretation(raw: RawInterpretationInput): Interpretation {
  return {
    summary: raw.summary,
    themes: raw.themes,
    symbols: raw.symbols,
    emotionalTone: raw.emotionalTone ?? raw.emotional_tone ?? '',
    patternNote: raw.patternNote ?? raw.pattern_note ?? null,
    questionsToReflectOn: raw.questionsToReflectOn ?? raw.questions_to_reflect_on ?? [],
  };
}

interface RawDream {
  id: string;
  recordedAt: string;
  rawTranscript: string;
  editedTranscript: string | null;
  interpretation: RawInterpretationInput | null;
}

/**
 * Drives the InterpretationScreen's data lifecycle (Task 8).
 *
 * Flow: GET /v1/dreams/:id. If the dream already carries an interpretation,
 * we're done. Otherwise POST /v1/dreams/:id/interpret and merge its result
 * into the dream. Either source is passed through normalizeInterpretation so
 * screens only ever see camelCase fields. Fires haptics.interpretationReady
 * exactly once when an interpretation becomes available. `retry` re-runs the
 * whole GET (+ interpret if needed) flow from scratch.
 */
export function useInterpretation(dreamId: string): UseInterpretationResult {
  const [status, setStatus] = useState<InterpretationStatus>('loading');
  const [dream, setDream] = useState<InterpretedDream | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const fetched = await api.get<RawDream>(`/v1/dreams/${dreamId}`);

      let interpretation: Interpretation;
      if (fetched.interpretation != null) {
        interpretation = normalizeInterpretation(fetched.interpretation);
      } else {
        const posted = await api.post<RawInterpretationInput>(`/v1/dreams/${dreamId}/interpret`);
        interpretation = normalizeInterpretation(posted);
      }

      setDream({
        id: fetched.id,
        recordedAt: fetched.recordedAt,
        rawTranscript: fetched.rawTranscript,
        editedTranscript: fetched.editedTranscript,
        interpretation,
      });
      setStatus('ok');
      haptics.interpretationReady();
    } catch {
      setStatus('error');
    }
  }, [dreamId]);

  useEffect(() => {
    load();
  }, [load]);

  return { status, dream, retry: load };
}
