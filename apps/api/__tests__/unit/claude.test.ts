// apps/api/__tests__/unit/claude.test.ts
import { makeClaude } from '../../src/services/claude';

// Mock Anthropic client shape: tests inject a fake rather than the real SDK client (brief's mock-injected style).
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double for Anthropic client, shape-compatible only
const reply = (text: string) =>
  ({ messages: { create: async () => ({ content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 10 } }) } }) as any;

it('parses a valid JSON interpretation', async () => {
  const good = JSON.stringify({
    summary: 's',
    themes: ['t'],
    symbols: [{ symbol: 'water', interpretation: 'x' }],
    emotionalTone: 'calm',
    patternNote: null,
    questionsToReflectOn: ['q'],
  });
  const out = await makeClaude(reply(good)).interpret({ transcript: 'd', symbolContext: '', patternContext: '' });
  expect(out.summary).toBe('s');
  expect(out.modelVersion).toBe('claude-sonnet-4-6');
});

it('returns the safe default when Claude returns malformed JSON', async () => {
  const out = await makeClaude(reply('not json')).interpret({ transcript: 'd', symbolContext: '', patternContext: '' });
  expect(out.emotionalTone).toBe('contemplative'); // safe default
  expect(out.symbols).toEqual([]);
});

it('parses a valid JSON interpretation wrapped in a ```json fence', async () => {
  const good = JSON.stringify({
    summary: 'fenced',
    themes: ['t'],
    symbols: [],
    emotionalTone: 'calm',
    patternNote: null,
    questionsToReflectOn: ['q'],
  });
  const fenced = '```json\n' + good + '\n```';
  const out = await makeClaude(reply(fenced)).interpret({ transcript: 'd', symbolContext: '', patternContext: '' });
  expect(out.summary).toBe('fenced');
  expect(out.modelVersion).toBe('claude-sonnet-4-6');
});

it('returns the safe default when a required field is missing', async () => {
  // Valid JSON, but missing the required `emotionalTone` field.
  const incomplete = JSON.stringify({
    summary: 's',
    themes: ['t'],
    symbols: [],
    patternNote: null,
    questionsToReflectOn: ['q'],
  });
  const out = await makeClaude(reply(incomplete)).interpret({ transcript: 'd', symbolContext: '', patternContext: '' });
  expect(out.emotionalTone).toBe('contemplative');
  expect(out.summary).not.toBe('s'); // fell back to safe default, not the partial parse
});
