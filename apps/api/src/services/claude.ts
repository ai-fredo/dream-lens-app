// apps/api/src/services/claude.ts
//
// Calls Claude to produce a DreamInterpretation from a dream transcript plus
// RAG context (engineering-standards §7 Steps 5-6). The system prompt is
// §7a verbatim; on any parse/validation failure we return the §7b safe
// default so the caller always gets a usable interpretation. Per §4.5, dream
// content (transcript, interpretation text) must NEVER be logged — only the
// fact that a fallback occurred, tagged with error code CLAUDE_MALFORMED_RESPONSE.
import type Anthropic from '@anthropic-ai/sdk';
import type { DreamInterpretation, SymbolInterpretation } from '@dreamlens/shared/types/domain';
import { logger } from '../middleware/logger';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1000;

export interface ClaudeInterpretParams {
  transcript: string;
  symbolContext: string;
  patternContext: string;
}

export interface ClaudeService {
  interpret(params: ClaudeInterpretParams): Promise<DreamInterpretation>;
}

/** Shape Claude is instructed to return (engineering-standards §7a response schema), before stamping. */
interface RawInterpretation {
  summary: string;
  themes: string[];
  symbols: SymbolInterpretation[];
  emotionalTone: string;
  patternNote: string | null;
  questionsToReflectOn: string[];
}

/** §7b: returned whenever Claude fails or returns malformed/incomplete JSON. */
function safeDefaultInterpretation(): DreamInterpretation {
  return {
    summary:
      "This dream contains imagery worth sitting with. Your subconscious may be working through something meaningful that hasn't yet resolved in waking life.",
    themes: ['Processing', 'Inner exploration'],
    symbols: [],
    emotionalTone: 'contemplative',
    patternNote: null,
    questionsToReflectOn: [
      'What emotions did this dream leave you with?',
      'Does anything in the dream connect to something happening in your life right now?',
    ],
    generatedAt: new Date(),
    modelVersion: MODEL,
  };
}

/** §7a: the Claude system prompt template, with symbolContext/patternContext/transcript interpolated. */
function buildSystemPrompt(params: ClaudeInterpretParams): string {
  return `You are DreamLens, a thoughtful dream analyst grounded in analytical psychology and cross-cultural symbol traditions. Your tone is warm, curious, and non-prescriptive. You offer interpretations as possibilities, not diagnoses. You never claim to know definitively what a dream means. You do not give medical advice.

SYMBOL REFERENCE MATERIAL (use to inform, not to quote verbatim):
${params.symbolContext}

${params.patternContext}

THE DREAM:
${params.transcript}

Return ONLY a valid JSON object with exactly these fields and no other text:
{
  "summary": "2-3 sentence holistic interpretation of the dream as a complete experience",
  "themes": ["3-5 psychological or emotional themes present, as short phrases"],
  "symbols": [{"symbol": "name", "interpretation": "what this symbol might mean in context of THIS dream"}],
  "emotionalTone": "single dominant emotional quality (e.g. anxious, peaceful, surreal, melancholic, urgent)",
  "patternNote": "if recurring patterns exist in user history, reference them specifically here; otherwise null",
  "questionsToReflectOn": ["2-3 open questions to help the user connect dream to waking life"]
}`;
}

/** Strips a ```json ... ``` (or bare ```) fence around the response text, if present. */
function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced?.[1] ?? trimmed;
}

/** Validates that `value` has every field a RawInterpretation needs, with the right shapes. */
function isValidRawInterpretation(value: unknown): value is RawInterpretation {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;

  if (typeof v.summary !== 'string') return false;
  if (!Array.isArray(v.themes) || !v.themes.every((t) => typeof t === 'string')) return false;
  if (
    !Array.isArray(v.symbols) ||
    !v.symbols.every(
      (s) =>
        typeof s === 'object' &&
        s !== null &&
        typeof (s as Record<string, unknown>).symbol === 'string' &&
        typeof (s as Record<string, unknown>).interpretation === 'string'
    )
  ) {
    return false;
  }
  if (typeof v.emotionalTone !== 'string') return false;
  if (v.patternNote !== null && typeof v.patternNote !== 'string') return false;
  if (!Array.isArray(v.questionsToReflectOn) || !v.questionsToReflectOn.every((q) => typeof q === 'string')) {
    return false;
  }

  return true;
}

/**
 * Wraps an injected Anthropic client so callers (and tests) can supply a fake
 * with the same shape, following the `makeX(injectedClient)` factory pattern
 * used elsewhere (see services/rag.ts, services/embeddings.ts).
 */
export function makeClaude(anthropic: Anthropic): ClaudeService {
  return {
    async interpret(params: ClaudeInterpretParams): Promise<DreamInterpretation> {
      const system = buildSystemPrompt(params);

      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0,
        system,
        messages: [{ role: 'user', content: params.transcript }],
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        logger.warn({ event: 'claude_fallback', code: 'CLAUDE_MALFORMED_RESPONSE', reason: 'no_text_block' });
        return safeDefaultInterpretation();
      }

      try {
        const parsed: unknown = JSON.parse(stripJsonFence(textBlock.text));
        if (!isValidRawInterpretation(parsed)) {
          logger.warn({ event: 'claude_fallback', code: 'CLAUDE_MALFORMED_RESPONSE', reason: 'missing_fields' });
          return safeDefaultInterpretation();
        }

        return {
          summary: parsed.summary,
          themes: parsed.themes,
          symbols: parsed.symbols,
          emotionalTone: parsed.emotionalTone,
          patternNote: parsed.patternNote,
          questionsToReflectOn: parsed.questionsToReflectOn,
          generatedAt: new Date(),
          modelVersion: MODEL,
        };
      } catch {
        // Log only that a fallback occurred — never log dream content or raw Claude output.
        logger.warn({ event: 'claude_fallback', code: 'CLAUDE_MALFORMED_RESPONSE', reason: 'json_parse_error' });
        return safeDefaultInterpretation();
      }
    },
  };
}
