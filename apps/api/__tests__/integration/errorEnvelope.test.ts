// apps/api/__tests__/integration/errorEnvelope.test.ts
import request from 'supertest';
import express from 'express';
import { makeApp } from '../../src/app';

describe('Error envelope middleware', () => {
  it('wraps thrown errors with custom status and code in success:false envelope', async () => {
    const testApp = makeApp((app) => {
      app.get('/v1/boom', (_req, _res, next) => {
        const err = Object.assign(new Error('boom'), { status: 418, code: 'TEAPOT' });
        next(err);
      });
    });

    const res = await request(testApp).get('/v1/boom');
    expect(res.status).toBe(418);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'TEAPOT', message: 'Something went wrong' },
    });
  });

  it('defaults to 500 and code:INTERNAL for plain errors', async () => {
    const testApp = makeApp((app) => {
      app.get('/v1/plain-error', (_req, _res, next) => {
        next(new Error('something broke'));
      });
    });

    const res = await request(testApp).get('/v1/plain-error');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'INTERNAL', message: 'Something went wrong' },
    });
  });

  it('handles errors thrown from async route handlers', async () => {
    const testApp = makeApp((app) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      app.get('/v1/async-error', async (_req, _res, next) => {
        try {
          throw Object.assign(new Error('async boom'), { status: 400, code: 'VALIDATION' });
        } catch (err) {
          next(err);
        }
      });
    });

    const res = await request(testApp).get('/v1/async-error');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'VALIDATION', message: 'Something went wrong' },
    });
  });
});
