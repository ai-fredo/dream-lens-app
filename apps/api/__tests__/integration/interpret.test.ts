// apps/api/__tests__/integration/interpret.test.ts
//
// Fully offline: makeTestApp wires the dreams router with an in-memory fake
// Supabase plus fake OpenAI/Anthropic clients (see helpers/fakeSupabase.ts).
// No live DB or AI provider required. Tests that need failure modes pass their
// own fakes (e.g. an anthropic that always throws) and a no-op interpretLimiter
// so the shared 5/min limiter never trips across the file.
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import type Anthropic from '@anthropic-ai/sdk';
import { authHeader, seedUser, makeTestApp } from '../helpers';
import { __fakeStoreForTests } from '../helpers/fakeSupabase';

// A no-op limiter so repeated interpret calls across this file don't hit the
// real 5/min interpretLimiter. The mounted-limiter test overrides this.
const noopLimiter = (_req: Request, _res: Response, next: NextFunction): void => next();

const app = makeTestApp({ interpretLimiter: noopLimiter });

/** Create a dream and return its id. */
async function createDream(token: string): Promise<string> {
  const res = await request(app)
    .post('/v1/dreams')
    .set(authHeader(token))
    .send({ rawTranscript: 'I was flying over a dark ocean', recordedAt: new Date().toISOString() });
  return res.body.data.id as string;
}

it('200 with interpretation on success', async () => {
  const u = await seedUser();
  const id = await createDream(u.token);
  const res = await request(app).post(`/v1/dreams/${id}/interpret`).set(authHeader(u.token));
  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  expect(res.body.data.summary).toBeDefined();
  expect(Array.isArray(res.body.data.themes)).toBe(true);
  expect(res.body.data.emotionalTone).toBeDefined();
  expect(res.body.data.modelVersion).toBe('claude-sonnet-4-6');
});

it('409 when already interpreted', async () => {
  const u = await seedUser();
  const id = await createDream(u.token);
  const first = await request(app).post(`/v1/dreams/${id}/interpret`).set(authHeader(u.token));
  expect(first.status).toBe(200);
  const res = await request(app).post(`/v1/dreams/${id}/interpret`).set(authHeader(u.token));
  expect(res.status).toBe(409);
  expect(res.body).toEqual({
    success: false,
    error: { code: 'ALREADY_INTERPRETED', message: expect.any(String) },
  });
});

it('404 when interpreting a non-existent dream', async () => {
  const u = await seedUser();
  const res = await request(app).post('/v1/dreams/dream-does-not-exist/interpret').set(authHeader(u.token));
  expect(res.status).toBe(404);
  expect(res.body.error.code).toBe('NOT_FOUND');
});

it('404 when interpreting another user dream', async () => {
  const a = await seedUser();
  const b = await seedUser();
  const id = await createDream(b.token);
  const res = await request(app).post(`/v1/dreams/${id}/interpret`).set(authHeader(a.token));
  expect(res.status).toBe(404);
});

it('401 without auth', async () => {
  const res = await request(app).post('/v1/dreams/some-id/interpret');
  expect(res.status).toBe(401);
});

it('409 on repeat interpret (idempotency test)', async () => {
  const u = await seedUser();
  const id = await createDream(u.token);
  await request(app).post(`/v1/dreams/${id}/interpret`).set(authHeader(u.token));
  // A second interpret is a 409, proving needs_interpretation/interpretation was persisted.
  const again = await request(app).post(`/v1/dreams/${id}/interpret`).set(authHeader(u.token));
  expect(again.status).toBe(409);
});

it('503 CLAUDE_UNAVAILABLE when Claude keeps failing (needs_interpretation set)', async () => {
  const throwingAnthropic = {
    messages: {
      create: async (): Promise<never> => {
        throw new Error('claude down');
      },
    },
  } as unknown as Anthropic;
  const app503 = makeTestApp({ anthropic: throwingAnthropic, interpretLimiter: noopLimiter });
  const u = await seedUser();
  const create = await request(app503)
    .post('/v1/dreams')
    .set(authHeader(u.token))
    .send({ rawTranscript: 'a dream that will fail to interpret', recordedAt: new Date().toISOString() });
  const id = create.body.data.id as string;

  const res = await request(app503).post(`/v1/dreams/${id}/interpret`).set(authHeader(u.token));
  expect(res.status).toBe(503);
  expect(res.body).toEqual({
    success: false,
    error: { code: 'CLAUDE_UNAVAILABLE', message: expect.any(String) },
  });

  // Transcript saved + flagged: a retry (Claude still down) is still 503, not 409.
  const retry = await request(app503).post(`/v1/dreams/${id}/interpret`).set(authHeader(u.token));
  expect(retry.status).toBe(503);
});

it('interpretLimiter is actually mounted (429 envelope when it rejects)', async () => {
  const alwaysLimited = (_req: Request, res: Response, _next: NextFunction): void => {
    res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'slow down' } });
  };
  const appLimited = makeTestApp({ interpretLimiter: alwaysLimited });
  const u = await seedUser();
  const id = await createDream(u.token);
  const res = await request(appLimited).post(`/v1/dreams/${id}/interpret`).set(authHeader(u.token));
  expect(res.status).toBe(429);
  expect(res.body.error.code).toBe('RATE_LIMITED');
});

it('increment semantics: two dreams with shared symbols increment occurrence_count to 2', async () => {
  const u = await seedUser();
  const id1 = await createDream(u.token);
  const id2 = await createDream(u.token);

  // Interpret both dreams. The fake Anthropic returns a fixed interpretation
  // with symbols 'ocean' and 'flight', so both dreams will share those symbols.
  const res1 = await request(app).post(`/v1/dreams/${id1}/interpret`).set(authHeader(u.token));
  expect(res1.status).toBe(200);
  expect(res1.body.success).toBe(true);

  const res2 = await request(app).post(`/v1/dreams/${id2}/interpret`).set(authHeader(u.token));
  expect(res2.status).toBe(200);
  expect(res2.body.success).toBe(true);

  // Both interpretations succeeded. Now check the user_patterns store.
  // The shared symbols should have occurrence_count === 2.
  const patterns = __fakeStoreForTests.userPatterns;
  const oceanPattern = patterns.find((p) => p.user_id === u.id && p.label === 'ocean');
  const flightPattern = patterns.find((p) => p.user_id === u.id && p.label === 'flight');

  expect(oceanPattern).toBeDefined();
  expect(oceanPattern?.pattern_type).toBe('symbol');
  expect(oceanPattern?.occurrence_count).toBe(2);

  expect(flightPattern).toBeDefined();
  expect(flightPattern?.pattern_type).toBe('symbol');
  expect(flightPattern?.occurrence_count).toBe(2);

  // Themes should also increment. The fake returns themes: ['Freedom', 'The unknown', 'Transition'].
  const freedomPattern = patterns.find((p) => p.user_id === u.id && p.label === 'Freedom');
  expect(freedomPattern).toBeDefined();
  expect(freedomPattern?.pattern_type).toBe('theme');
  expect(freedomPattern?.occurrence_count).toBe(2);
});

it('rpc failure (increment_user_patterns) does not fail the interpret request (200, no pattern change)', async () => {
  const u = await seedUser();
  const id = await createDream(u.token);

  // Arm the failNextRpc hook to make increment_user_patterns fail once.
  __fakeStoreForTests.failNextRpc = 'increment_user_patterns';

  const res = await request(app).post(`/v1/dreams/${id}/interpret`).set(authHeader(u.token));
  // Despite the RPC failure, the interpret request should still succeed (200)
  // because pattern bookkeeping is best-effort (line 285-293 in dreams.ts).
  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  expect(res.body.data.summary).toBeDefined();
  expect(res.body.data.themes).toBeDefined();

  // The user_patterns table should be empty or unchanged because the RPC failed.
  const patterns = __fakeStoreForTests.userPatterns;
  const userPatterns = patterns.filter((p) => p.user_id === u.id);
  expect(userPatterns).toHaveLength(0);
});
