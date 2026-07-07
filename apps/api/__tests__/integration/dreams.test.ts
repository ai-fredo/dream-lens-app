// apps/api/__tests__/integration/dreams.test.ts
import request from 'supertest';
import { authHeader, seedUser, seedUserWithDreams, makeTestApp } from '../helpers';

// Fully offline: makeTestApp wires the dreams router with an in-memory fake
// Supabase (see helpers/fakeSupabase.ts). No live DB required. Each test file
// gets its own app + fake store at module scope.
const app = makeTestApp();

// ---- Brief's tests (verbatim bodies, app via makeTestApp per resolution 5) ----

it('POST /v1/dreams creates and returns 201', async () => {
  const u = await seedUser();
  const res = await request(app)
    .post('/v1/dreams')
    .set(authHeader(u.token))
    .send({ rawTranscript: 'x'.repeat(20), recordedAt: new Date().toISOString() });
  expect(res.status).toBe(201);
  expect(res.body.data.id).toBeDefined();
});

it('401 without auth', async () => {
  expect((await request(app).post('/v1/dreams').send({})).status).toBe(401);
});

it('400 when transcript exceeds 5000 chars', async () => {
  const u = await seedUser();
  const res = await request(app)
    .post('/v1/dreams')
    .set(authHeader(u.token))
    .send({ rawTranscript: 'x'.repeat(5001), recordedAt: new Date().toISOString() });
  expect(res.status).toBe(400);
});

it('404 GET of another user dream', async () => {
  const a = await seedUser();
  const b = await seedUser();
  const created = await request(app)
    .post('/v1/dreams')
    .set(authHeader(b.token))
    .send({ rawTranscript: 'x'.repeat(20), recordedAt: new Date().toISOString() });
  const res = await request(app).get(`/v1/dreams/${created.body.data.id}`).set(authHeader(a.token));
  expect(res.status).toBe(404);
});

// ---- Extra focused cases (Produces line demands these behaviors) ----

it('GET /v1/dreams returns the caller-owned dreams in an envelope', async () => {
  const u = await seedUser();
  await request(app)
    .post('/v1/dreams')
    .set(authHeader(u.token))
    .send({ rawTranscript: 'first dream here', recordedAt: new Date().toISOString() });
  await request(app)
    .post('/v1/dreams')
    .set(authHeader(u.token))
    .send({ rawTranscript: 'second dream here', recordedAt: new Date().toISOString() });

  const res = await request(app).get('/v1/dreams').set(authHeader(u.token));
  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  expect(Array.isArray(res.body.data)).toBe(true);
  expect(res.body.data.length).toBe(2);
});

it('GET /v1/dreams paginates via limit/offset', async () => {
  const u = await seedUser();
  for (let i = 0; i < 5; i++) {
    await request(app)
      .post('/v1/dreams')
      .set(authHeader(u.token))
      .send({ rawTranscript: `dream number ${i}`, recordedAt: new Date().toISOString() });
  }
  const res = await request(app).get('/v1/dreams?limit=2&offset=0').set(authHeader(u.token));
  expect(res.status).toBe(200);
  expect(res.body.data.length).toBe(2);

  const res2 = await request(app).get('/v1/dreams?limit=2&offset=4').set(authHeader(u.token));
  expect(res2.body.data.length).toBe(1);
});

it('GET /v1/dreams/:id returns the owned dream', async () => {
  const u = await seedUser();
  const created = await request(app)
    .post('/v1/dreams')
    .set(authHeader(u.token))
    .send({ rawTranscript: 'a dream to fetch', recordedAt: new Date().toISOString() });
  const res = await request(app).get(`/v1/dreams/${created.body.data.id}`).set(authHeader(u.token));
  expect(res.status).toBe(200);
  expect(res.body.data.id).toBe(created.body.data.id);
  // A freshly created dream has no interpretation yet — the DTO carries the
  // field as null (rather than omitting it) so callers (e.g. the mobile
  // app's useInterpretation hook) can tell "not interpreted" from "unknown".
  expect(res.body.data.interpretation).toBeNull();
});

it('GET /v1/dreams/:id round-trips the interpretation object for an already-interpreted dream', async () => {
  const u = await seedUserWithDreams(1); // seeded dream carries interpretation: { summary: 'seeded' }
  const list = await request(app).get('/v1/dreams').set(authHeader(u.token));
  const dreamId = list.body.data[0].id;

  const res = await request(app).get(`/v1/dreams/${dreamId}`).set(authHeader(u.token));
  expect(res.status).toBe(200);
  expect(res.body.data.interpretation).toEqual({ summary: 'seeded' });
});

it('PUT /v1/dreams/:id edits the transcript', async () => {
  const u = await seedUser();
  const created = await request(app)
    .post('/v1/dreams')
    .set(authHeader(u.token))
    .send({ rawTranscript: 'original transcript', recordedAt: new Date().toISOString() });
  const res = await request(app)
    .put(`/v1/dreams/${created.body.data.id}`)
    .set(authHeader(u.token))
    .send({ editedTranscript: 'the edited transcript text' });
  expect(res.status).toBe(200);
  expect(res.body.data.editedTranscript).toBe('the edited transcript text');
});

it('PUT /v1/dreams/:id of another user dream is 404', async () => {
  const a = await seedUser();
  const b = await seedUser();
  const created = await request(app)
    .post('/v1/dreams')
    .set(authHeader(b.token))
    .send({ rawTranscript: 'b owns this dream', recordedAt: new Date().toISOString() });
  const res = await request(app)
    .put(`/v1/dreams/${created.body.data.id}`)
    .set(authHeader(a.token))
    .send({ editedTranscript: 'a is trying to edit it' });
  expect(res.status).toBe(404);
});

it('PUT /v1/dreams/:id rejects a too-short edit with 400', async () => {
  const u = await seedUser();
  const created = await request(app)
    .post('/v1/dreams')
    .set(authHeader(u.token))
    .send({ rawTranscript: 'original transcript', recordedAt: new Date().toISOString() });
  const res = await request(app)
    .put(`/v1/dreams/${created.body.data.id}`)
    .set(authHeader(u.token))
    .send({ editedTranscript: 'short' });
  expect(res.status).toBe(400);
});

it('402 UPGRADE_REQUIRED when a free user hits the 10-dream gate', async () => {
  const u = await seedUser();
  for (let i = 0; i < 10; i++) {
    const ok = await request(app)
      .post('/v1/dreams')
      .set(authHeader(u.token))
      .send({ rawTranscript: `dream ${i} content`, recordedAt: new Date().toISOString() });
    expect(ok.status).toBe(201);
  }
  const gated = await request(app)
    .post('/v1/dreams')
    .set(authHeader(u.token))
    .send({ rawTranscript: 'eleventh dream over limit', recordedAt: new Date().toISOString() });
  expect(gated.status).toBe(402);
  expect(gated.body).toEqual({
    success: false,
    error: { code: 'UPGRADE_REQUIRED', message: expect.any(String) },
  });
});

it('a pro user is not gated at 10 dreams', async () => {
  const u = await seedUser({ tier: 'pro' });
  for (let i = 0; i < 11; i++) {
    const res = await request(app)
      .post('/v1/dreams')
      .set(authHeader(u.token))
      .send({ rawTranscript: `pro dream ${i}`, recordedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
  }
});
