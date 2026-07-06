// apps/api/__tests__/integration/demo.test.ts
//
// Fully offline: makeTestApp wires the demo router with a fake Anthropic
// client and a no-op limiter by default (see helpers/fakeSupabase.ts). No
// live DB or AI provider required. This is the PUBLIC endpoint the landing
// page calls at `${DREAMLENS_API_BASE}/v1/demo/interpret` — no auth. The
// response contract is deliberately narrow (snake_case, singular `question`)
// and must not be confused with the authed dreams interpret DTO.
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import type Anthropic from '@anthropic-ai/sdk';
import { makeTestApp } from '../helpers';

const noopLimiter = (_req: Request, _res: Response, next: NextFunction): void => next();

const app = makeTestApp({ demoLimiter: noopLimiter });

it('returns an interpretation for a valid demo transcript', async () => {
  const res = await request(app)
    .post('/v1/demo/interpret')
    .send({ transcript: 'I dreamed of the ocean and felt calm' });
  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  expect(res.body.data.summary).toBeDefined();
  // Exact demo contract: snake_case emotional_tone, singular question, no extras.
  expect(Object.keys(res.body.data).sort()).toEqual(['emotional_tone', 'question', 'summary', 'themes']);
  expect(Array.isArray(res.body.data.themes)).toBe(true);
  expect(typeof res.body.data.emotional_tone).toBe('string');
  expect(typeof res.body.data.question).toBe('string');
});

it('400 when transcript too short', async () => {
  const res = await request(app).post('/v1/demo/interpret').send({ transcript: 'hi' });
  expect(res.status).toBe(400);
  expect(res.body.success).toBe(false);
});

it('demoLimiter is actually mounted (429 envelope when it rejects)', async () => {
  const alwaysLimited = (_req: Request, res: Response, _next: NextFunction): void => {
    res.status(429).json({ success: false, error: { code: 'DEMO_LIMIT', message: 'slow down' } });
  };
  const appLimited = makeTestApp({ demoLimiter: alwaysLimited });
  const res = await request(appLimited)
    .post('/v1/demo/interpret')
    .send({ transcript: 'I dreamed of the ocean and felt calm' });
  expect(res.status).toBe(429);
  expect(res.body.error.code).toBe('DEMO_LIMIT');
});

it('503 CLAUDE_UNAVAILABLE when Claude keeps failing', async () => {
  const throwingAnthropic = {
    messages: {
      create: async (): Promise<never> => {
        throw new Error('claude down');
      },
    },
  } as unknown as Anthropic;
  const app503 = makeTestApp({ anthropic: throwingAnthropic, demoLimiter: noopLimiter });
  const res = await request(app503)
    .post('/v1/demo/interpret')
    .send({ transcript: 'I dreamed of the ocean and felt calm' });
  expect(res.status).toBe(503);
  expect(res.body).toEqual({
    success: false,
    error: { code: 'CLAUDE_UNAVAILABLE', message: expect.any(String) },
  });
});
