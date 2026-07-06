// apps/api/__tests__/integration/account.test.ts
import request from 'supertest';
import { authHeader, seedUser, makeTestApp } from '../helpers';
import { __fakeStoreForTests } from '../helpers/fakeSupabase';

// Fully offline: makeTestApp wires the account router with an in-memory fake
// Supabase (see helpers/fakeSupabase.ts). No live DB required.
const app = makeTestApp();

// ---- Brief's tests (verbatim bodies) ----

it('DELETE /v1/account removes the user data and returns 200', async () => {
  const u = await seedUser();
  const res = await request(app).delete('/v1/account').set(authHeader(u.token));
  expect(res.status).toBe(200);
});

it('401 without auth', async () => {
  expect((await request(app).delete('/v1/account')).status).toBe(401);
});

// ---- Extra focused cases ----

it('DELETE /v1/account actually deletes dreams, profile, patterns, and auth user', async () => {
  const u = await seedUser();
  await request(app)
    .post('/v1/dreams')
    .set(authHeader(u.token))
    .send({ rawTranscript: 'x'.repeat(20), recordedAt: new Date().toISOString() });

  __fakeStoreForTests.userPatterns.push({
    user_id: u.id,
    symbol: 'ocean',
    occurrence_count: 1,
    first_seen: new Date().toISOString(),
    last_seen: new Date().toISOString(),
  });

  const res = await request(app).delete('/v1/account').set(authHeader(u.token));
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ success: true, data: { deleted: true } });

  expect(__fakeStoreForTests.dreams.some((d) => d.user_id === u.id)).toBe(false);
  expect(__fakeStoreForTests.userPatterns.some((p) => p.user_id === u.id)).toBe(false);
  expect(__fakeStoreForTests.profiles.has(u.id)).toBe(false);
  expect(__fakeStoreForTests.deletedAuthUsers.has(u.id)).toBe(true);
});

it('a deletion step failure surfaces as a 500 envelope (no partial-success 200)', async () => {
  const u = await seedUser();
  __fakeStoreForTests.failNextDeleteFor = u.id;

  const res = await request(app).delete('/v1/account').set(authHeader(u.token));
  expect(res.status).toBe(500);
  expect(res.body.success).toBe(false);
  expect(res.body.error).toBeDefined();
});
