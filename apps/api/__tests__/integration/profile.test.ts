// apps/api/__tests__/integration/profile.test.ts
//
// Fully offline: makeTestApp wires the profile router with an in-memory fake
// Supabase (see helpers/fakeSupabase.ts). No live DB required.
//
// The brief's `seedUserWithDreams(n)` helper is implemented in the fake harness
// via store-level seeding (a user + n interpreted dreams + one unseen insight).
// Store-level seeding is acceptable here because the real create/interpret flow
// is already exercised end-to-end in interpret.test.ts; this suite focuses on
// the profile aggregation + insight-seen contract, not the interpret path.
import request from 'supertest';
import { authHeader, seedUser, seedUserWithDreams, makeTestApp } from '../helpers';

const app = makeTestApp();

// ---- Brief's tests (adapted to makeTestApp) ----

it('GET /v1/profile/summary returns the four sections for the caller only', async () => {
  const { token } = await seedUserWithDreams(6); // >= threshold
  const res = await request(app).get('/v1/profile/summary').set(authHeader(token));
  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  expect(res.body.data).toEqual(
    expect.objectContaining({
      summary: expect.any(Object),
      emotionArc: expect.any(Array),
      clusters: expect.any(Array),
      insights: expect.any(Array),
    }),
  );
});

it('returns 401 without auth', async () => {
  const res = await request(app).get('/v1/profile/summary');
  expect(res.status).toBe(401);
});

it('user A cannot mark user B insight seen (RLS hides B row from A)', async () => {
  const a = await seedUserWithDreams(1);
  const b = await seedUserWithDreams(6);
  const bInsightId = b.insightIds[0]!;
  const res = await request(app).post(`/v1/insights/${bInsightId}/seen`).set(authHeader(a.token));
  expect(res.status).toBe(404);
  expect(res.body.success).toBe(false);
  expect(res.body.error.code).toBe('RECORD_NOT_FOUND');
});

// ---- Extra focused cases (per task brief additions) ----

it('GET /v1/profile/summary returns 200 with all four sections for a user with ZERO dreams', async () => {
  const { token } = await seedUser();
  const res = await request(app).get('/v1/profile/summary').set(authHeader(token));
  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  // Empty-state contract (mobile teaser): every section present, arrays empty,
  // summary an object with a zero dream count.
  expect(res.body.data.summary).toEqual(expect.objectContaining({ totalDreams: 0 }));
  expect(res.body.data.emotionArc).toEqual([]);
  expect(res.body.data.clusters).toEqual([]);
  expect(res.body.data.insights).toEqual([]);
});

it('POST /v1/insights/:id/seen marks the caller-owned insight seen and returns { id }', async () => {
  const u = await seedUserWithDreams(6);
  const id = u.insightIds[0]!;
  const res = await request(app).post(`/v1/insights/${id}/seen`).set(authHeader(u.token));
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ success: true, data: { id } });
});

it('POST /v1/insights/:id/seen returns 401 without auth', async () => {
  const u = await seedUserWithDreams(6);
  const id = u.insightIds[0]!;
  const res = await request(app).post(`/v1/insights/${id}/seen`);
  expect(res.status).toBe(401);
});

it('POST /v1/insights/:id/seen returns 400 VALIDATION_ERROR for a non-UUID id', async () => {
  const u = await seedUser();
  const res = await request(app).post('/v1/insights/not-a-uuid/seen').set(authHeader(u.token));
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('VALIDATION_ERROR');
});

it('POST /v1/insights/:id/seen returns 404 for an unknown (well-formed) id', async () => {
  const u = await seedUser();
  const missing = '00000000-0000-4000-8000-000000000000';
  const res = await request(app).post(`/v1/insights/${missing}/seen`).set(authHeader(u.token));
  expect(res.status).toBe(404);
  expect(res.body.error.code).toBe('RECORD_NOT_FOUND');
});
