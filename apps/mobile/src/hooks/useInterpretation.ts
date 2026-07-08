import { useCallback, useEffect, useRef, useState } from 'react';
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
  notes: string | null;
}

export type InterpretationStatus = 'loading' | 'ok' | 'error';

export interface UseInterpretationResult {
  status: InterpretationStatus;
  dream: InterpretedDream | null;
  retry: () => Promise<void>;
}

export interface UseInterpretationOptions {
  /** When false, an uninterpreted dream is left as-is (no POST .../interpret
   * call) — used by EntryDetailScreen, which must never trigger interpretation
   * just by viewing a past, uninterpreted entry. Defaults to true so existing
   * callers (InterpretationScreen) are unchanged. */
  interpretIfMissing?: boolean;
}

/** Raw shapes this mapper accepts — the server DTO documents camelCase, but
 * this normalizer is defensive: it accepts either casing for every field
 * that has a snake_case sibling (emotional_tone, pattern_note,
 * questions_to_reflect_on) so screens never have to think about it. */
export interface RawInterpretationInput {
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
export function normalizeInterpretation(raw: RawInterpretationInput): Interpretation {
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
  notes?: string | null;
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
 *
 * Load-token guard: `loadToken` is bumped at the start of every `load()`
 * call. Each invocation captures its own token value and, after every
 * `await`, bails out (without touching state) if the ref no longer matches —
 * either because the component unmounted (the effect cleanup below bumps the
 * token) or because a newer `load()`/`retry()` call (e.g. a `dreamId` change)
 * superseded this one. This avoids both "state update on an unmounted
 * component" warnings and a slow, stale response clobbering a newer one.
 */
export function useInterpretation(
  dreamId: string,
  options?: UseInterpretationOptions,
): UseInterpretationResult {
  const interpretIfMissing = options?.interpretIfMissing ?? true;
  const [status, setStatus] = useState<InterpretationStatus>('loading');
  const [dream, setDream] = useState<InterpretedDream | null>(null);

  const loadToken = useRef(0);

  const load = useCallback(async () => {
    const token = ++loadToken.current;
    setStatus('loading');
    try {
      const fetched = await api.get<RawDream>(`/v1/dreams/${dreamId}`);
      if (loadToken.current !== token) return;

      let interpretation: Interpretation | null;
      if (fetched.interpretation != null) {
        interpretation = normalizeInterpretation(fetched.interpretation);
      } else if (interpretIfMissing) {
        const posted = await api.post<RawInterpretationInput>(`/v1/dreams/${dreamId}/interpret`);
        if (loadToken.current !== token) return;
        interpretation = normalizeInterpretation(posted);
      } else {
        // Viewing a past, uninterpreted dream (e.g. EntryDetailScreen) must
        // never trigger interpretation as a side effect of loading it.
        interpretation = null;
      }

      if (loadToken.current !== token) return;
      setDream({
        id: fetched.id,
        recordedAt: fetched.recordedAt,
        rawTranscript: fetched.rawTranscript,
        editedTranscript: fetched.editedTranscript,
        interpretation,
        notes: fetched.notes ?? null,
      });
      setStatus('ok');
      if (interpretation != null) haptics.interpretationReady();
    } catch {
      if (loadToken.current !== token) return;
      setStatus('error');
    }
  }, [dreamId, interpretIfMissing]);

  useEffect(() => {
    load();
    return () => {
      // Unmount, or dreamId is about to change and this effect will re-run:
      // invalidate the in-flight token so trailing setState calls no-op.
      loadToken.current += 1;
    };
  }, [load]);

  return { status, dream, retry: load };
}
