// types/domain.ts

export type DreamId = string & { readonly brand: 'DreamId' };
export type UserId = string & { readonly brand: 'UserId' };

export interface DreamEntry {
  id: DreamId;
  userId: UserId;
  recordedAt: Date;
  rawTranscript: string;
  editedTranscript: string | null;
  interpretation: DreamInterpretation | null;
  embedding: number[] | null;
  createdAt: Date;
}

export interface DreamInterpretation {
  summary: string;
  themes: string[];
  symbols: SymbolInterpretation[];
  emotionalTone: string;
  patternNote: string | null;
  questionsToReflectOn: string[];
  generatedAt: Date;
  modelVersion: string;
}

export interface SymbolInterpretation {
  symbol: string;
  interpretation: string;
}

export interface DreamSymbol {
  id: string;
  symbol: string;
  category: SymbolCategory;
  interpretation: string;
  source: string;
  embedding: number[] | null;
}

// Canonical category taxonomy — MUST match the CHECK constraint on dream_symbols
// (migration 0002) and the categories used by the Knowledge Vault export.
export type SymbolCategory =
  | 'jungian_archetype'
  | 'scenario'
  | 'environment'
  | 'animal'
  | 'object'
  | 'body'
  | 'nature'
  | 'color'
  | 'relationship'
  | 'somatic'
  | 'freudian'
  | 'cultural';

export interface UserPattern {
  userId: UserId;
  symbol: string;
  occurrenceCount: number;
  firstSeen: Date;
  lastSeen: Date;
}

export interface UserPatternSummary {
  totalDreams: number;
  recurringSymbols: Array<{ symbol: string; count: number }>;
  dominantThemes: string[];
  dominantEmotionalTone: string | null;
  recentDreamSummaries: string[];
}

// API types
export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: ApiError };
