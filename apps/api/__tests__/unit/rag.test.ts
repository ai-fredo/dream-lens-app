// apps/api/__tests__/unit/rag.test.ts
import { makeRag } from '../../src/services/rag';

// Mock OpenAI client shapes: tests inject fakes rather than the real SDK client (brief's mock-injected style).
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double for OpenAI client, shape-compatible only
const openaiOk = { embeddings: { create: async () => ({ data: [{ embedding: new Array(1536).fill(0.01) }] }) } } as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double for OpenAI client, shape-compatible only
const openaiFail = { embeddings: { create: async () => { throw new Error('down'); } } } as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double for Supabase client, shape-compatible only
const dbWith = (symbols: any[]) => ({ rpc: async () => ({ data: symbols, error: null }), from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }) }) as any;

it('builds symbol context from matched symbols', async () => {
  const rag = makeRag(dbWith([{ symbol: 'water', interpretation: 'flow', category: 'environment' }]), openaiOk);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test uses a plain string where UserId is expected
  const ctx = await rag.buildContext('u1' as any, 'I dreamed of water');
  expect(ctx.symbolContext).toContain('water');
  expect(ctx.embedding).toHaveLength(1536);
});
it('degrades gracefully when embedding fails (skips RAG, no throw)', async () => {
  const rag = makeRag(dbWith([]), openaiFail);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test uses a plain string where UserId is expected
  const ctx = await rag.buildContext('u1' as any, 'x');
  expect(ctx.embedding).toBeNull();
  expect(ctx.symbolContext).toBe('');
});
