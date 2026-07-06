// apps/api/__tests__/integration/health.test.ts
import request from 'supertest';
import { app } from '../../src/app';

it('GET /v1/health returns 200 ok', async () => {
  const res = await request(app).get('/v1/health');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ success: true, data: { status: 'ok' } });
});
