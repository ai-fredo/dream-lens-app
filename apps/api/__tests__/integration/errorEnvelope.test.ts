// apps/api/__tests__/integration/errorEnvelope.test.ts
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { makeApp } from '../../src/app';
import { limitMessage } from '../../src/middleware/rateLimit';

describe('Error envelope middleware', () => {
  it('wraps thrown errors with custom status and code in success:false envelope', async () => {
    const testApp = makeApp({ extraRoutes: (app) => {
      app.get('/v1/boom', (_req, _res, next) => {
        const err = Object.assign(new Error('boom'), { status: 418, code: 'TEAPOT' });
        next(err);
      });
    } });

    const res = await request(testApp).get('/v1/boom');
    expect(res.status).toBe(418);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'TEAPOT', message: 'Something went wrong' },
    });
  });

  it('defaults to 500 and code:INTERNAL for plain errors', async () => {
    const testApp = makeApp({ extraRoutes: (app) => {
      app.get('/v1/plain-error', (_req, _res, next) => {
        next(new Error('something broke'));
      });
    } });

    const res = await request(testApp).get('/v1/plain-error');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'INTERNAL', message: 'Something went wrong' },
    });
  });

  it('handles errors thrown from async route handlers', async () => {
    const testApp = makeApp({ extraRoutes: (app) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      app.get('/v1/async-error', async (_req, _res, next) => {
        try {
          throw Object.assign(new Error('async boom'), { status: 400, code: 'VALIDATION' });
        } catch (err) {
          next(err);
        }
      });
    } });

    const res = await request(testApp).get('/v1/async-error');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'VALIDATION', message: 'Something went wrong' },
    });
  });
});

describe('404 catch-all', () => {
  it('returns the JSON envelope (not Express 5 HTML) for an unknown /v1 route', async () => {
    const testApp = makeApp();

    const res = await request(testApp).get('/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Not found' },
    });
  });

  it('returns the JSON envelope (not Express 5 HTML) for an unknown top-level route', async () => {
    const testApp = makeApp();

    const res = await request(testApp).get('/nope');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Not found' },
    });
  });

  it('does not shadow a route registered via extraRoutes', async () => {
    const testApp = makeApp({
      extraRoutes: (app) => {
        app.get('/v1/known-route', (_req, res) => {
          res.status(200).json({ success: true, data: { ok: true } });
        });
      },
    });

    const res = await request(testApp).get('/v1/known-route');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { ok: true } });
  });
});

describe('Rate-limit envelope (limitMessage)', () => {
  it('produces the success:false envelope shape with the given code and message', () => {
    expect(limitMessage('RATE_LIMITED', 'Too many requests')).toEqual({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests' },
    });
  });

  it('a real express-rate-limit instance built with limitMessage returns the envelope on the request that exceeds the limit', async () => {
    const testApp = express();
    testApp.use(
      rateLimit({
        windowMs: 60_000,
        limit: 1,
        standardHeaders: true,
        legacyHeaders: false,
        message: limitMessage('RATE_LIMITED', 'Too many requests'),
      }),
    );
    testApp.get('/v1/limited', (_req, res) => {
      res.status(200).json({ success: true, data: {} });
    });

    const first = await request(testApp).get('/v1/limited');
    expect(first.status).toBe(200);

    const second = await request(testApp).get('/v1/limited');
    expect(second.status).toBe(429);
    expect(second.headers['content-type']).toMatch(/json/);
    expect(second.body).toEqual({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests' },
    });
  });
});
