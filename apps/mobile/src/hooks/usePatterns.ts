import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';

export interface RecurringSymbol {
  label: string;
  count: number;
}

export interface PatternSummary {
  totalDreams: number;
  recurringSymbols: RecurringSymbol[];
  dominantTone: string | null;
}

export interface EmotionArcPoint {
  date: string;
  tone: string;
}

export interface PatternCluster {
  id: string;
  label: string;
  topSymbols: string[];
  dreamCount: number;
}

export interface PatternInsight {
  id: string;
  title: string;
  body: string;
  seenAt: string | null;
}

export interface PatternsData {
  summary: PatternSummary;
  emotionArc: EmotionArcPoint[];
  clusters: PatternCluster[];
  insights: PatternInsight[];
}

export type PatternsStatus = 'loading' | 'ok' | 'error';

export interface UsePatternsResult {
  status: PatternsStatus;
  data: PatternsData | null;
  retry: () => Promise<void>;
  markSeen: (id: string) => Promise<void>;
}

/** Raw shapes accepted from GET /v1/profile/summary — defensive against
 * either casing, mirroring useInterpretation's normalizeInterpretation
 * approach. The route's live response documents recurringSymbols as
 * `{symbol,count}` and the tone field as `dominantEmotionalTone` /
 * `emotionalTone`; insight rows come straight from the DB and are
 * snake_case (`created_at`/`seen_at`). This is the ONE normalizer —
 * nothing else in the app should branch on field casing. */
interface RawRecurringSymbol {
  label?: string;
  symbol?: string;
  count: number;
}

interface RawSummary {
  totalDreams?: number;
  total_dreams?: number;
  recurringSymbols?: RawRecurringSymbol[];
  recurring_symbols?: RawRecurringSymbol[];
  dominantTone?: string | null;
  dominant_tone?: string | null;
  dominantEmotionalTone?: string | null;
  dominant_emotional_tone?: string | null;
}

interface RawEmotionArcPoint {
  date: string;
  tone?: string;
  emotionalTone?: string;
  emotional_tone?: string;
}

interface RawCluster {
  id: string;
  label: string;
  topSymbols?: string[];
  top_symbols?: string[];
  dreamCount?: number;
  dream_count?: number;
}

interface RawInsight {
  id: string;
  title: string;
  body: string;
  seenAt?: string | null;
  seen_at?: string | null;
}

interface RawPatternsResponse {
  summary?: RawSummary;
  emotionArc?: RawEmotionArcPoint[];
  emotion_arc?: RawEmotionArcPoint[];
  clusters?: RawCluster[];
  insights?: RawInsight[];
}

function normalizeSummary(raw?: RawSummary): PatternSummary {
  const symbols = raw?.recurringSymbols ?? raw?.recurring_symbols ?? [];
  return {
    totalDreams: raw?.totalDreams ?? raw?.total_dreams ?? 0,
    recurringSymbols: symbols.map((s) => ({ label: s.label ?? s.symbol ?? '', count: s.count })),
    dominantTone:
      raw?.dominantTone ??
      raw?.dominant_tone ??
      raw?.dominantEmotionalTone ??
      raw?.dominant_emotional_tone ??
      null,
  };
}

function normalizeEmotionArc(raw?: RawEmotionArcPoint[]): EmotionArcPoint[] {
  return (raw ?? []).map((p) => ({
    date: p.date,
    tone: p.tone ?? p.emotionalTone ?? p.emotional_tone ?? '',
  }));
}

function normalizeClusters(raw?: RawCluster[]): PatternCluster[] {
  return (raw ?? []).map((c) => ({
    id: c.id,
    label: c.label,
    topSymbols: c.topSymbols ?? c.top_symbols ?? [],
    dreamCount: c.dreamCount ?? c.dream_count ?? 0,
  }));
}

function normalizeInsights(raw?: RawInsight[]): PatternInsight[] {
  return (raw ?? []).map((i) => ({
    id: i.id,
    title: i.title,
    body: i.body,
    seenAt: i.seenAt ?? i.seen_at ?? null,
  }));
}

function normalizePatterns(raw: RawPatternsResponse): PatternsData {
  return {
    summary: normalizeSummary(raw.summary),
    emotionArc: normalizeEmotionArc(raw.emotionArc ?? raw.emotion_arc),
    clusters: normalizeClusters(raw.clusters),
    insights: normalizeInsights(raw.insights),
  };
}

/**
 * Drives ProfileScreen's data lifecycle (Task 11).
 *
 * Fetches GET /v1/profile/summary and normalizes the response (which mixes
 * camelCase service output with raw snake_case DB rows for `insights`) into
 * one camelCase shape. `markSeen` is best-effort: it POSTs
 * /v1/insights/:id/seen and flips the local `seenAt` marker regardless of
 * whether the POST succeeds — a failed "mark seen" write must never block
 * the UI from treating the insight as acknowledged.
 *
 * Load-token guard mirrors useInterpretation.ts: `loadToken` is bumped at
 * the start of every load() call and on unmount, so a stale in-flight
 * response can never clobber newer state or fire setState after unmount.
 */
export function usePatterns(): UsePatternsResult {
  const [status, setStatus] = useState<PatternsStatus>('loading');
  const [data, setData] = useState<PatternsData | null>(null);

  const loadToken = useRef(0);

  const load = useCallback(async () => {
    const token = ++loadToken.current;
    setStatus('loading');
    try {
      const raw = await api.get<RawPatternsResponse>('/v1/profile/summary');
      if (loadToken.current !== token) return;
      setData(normalizePatterns(raw));
      setStatus('ok');
    } catch {
      if (loadToken.current !== token) return;
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    load();
    return () => {
      loadToken.current += 1;
    };
  }, [load]);

  const markSeen = useCallback(async (id: string) => {
    try {
      await api.post(`/v1/insights/${id}/seen`);
    } catch {
      // Best-effort: a failed "mark seen" write must not block the local
      // flip below, nor surface an error to the user.
    }
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        insights: prev.insights.map((i) =>
          i.id === id && i.seenAt == null ? { ...i, seenAt: new Date().toISOString() } : i,
        ),
      };
    });
  }, []);

  return { status, data, retry: load, markSeen };
}
