// apps/api/__tests__/integration/account.test.ts
import crypto from 'crypto';
import request from 'supertest';
import { authHeader, seedUser, makeTestApp } from '../helpers';
import { __fakeStoreForTests } from '../helpers/fakeSupabase';

// Fully offline: makeTestApp wires the account router with an in-memory fake
// Supabase (see helpers/fakeSupabase.ts). No live DB required.
const app = makeTestApp();

const APPLE_ENV_KEYS = ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY', 'APPLE_BUNDLE_ID'] as const;

/** Save/restore the four APPLE_* env vars per test — same discipline as
 * appleAuth.test.ts: never read or leak real .env values. */
let savedAppleEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedAppleEnv = {};
  for (const key of APPLE_ENV_KEYS) {
    savedAppleEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of APPLE_ENV_KEYS) {
    if (savedAppleEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedAppleEnv[key];
    }
  }
});

/** Sets all four APPLE_* env vars, with a real throwaway EC P-256 key so
 * makeAppleClientSecret() (called internally before any fetch) can actually
 * sign a JWT — same approach as appleAuth.test.ts. */
function setAppleEnv(): void {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  process.env.APPLE_TEAM_ID = 'TEAMID1234';
  process.env.APPLE_KEY_ID = 'KEYID5678';
  process.env.APPLE_PRIVATE_KEY = pem;
  process.env.APPLE_BUNDLE_ID = 'com.dreamlens.app';
}

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
    pattern_type: 'symbol',
    label: 'ocean',
    occurrence_count: 1,
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

// ---- Apple token revocation during deletion (Apple App Store requirement) ----

it('configured + stored token: revokes the Apple token, then completes deletion as before', async () => {
  setAppleEnv();
  const u = await seedUser();
  __fakeStoreForTests.appleCredentials.set(u.id, {
    user_id: u.id,
    refresh_token: 'rt_stored_abc',
    updated_at: new Date().toISOString(),
  });

  const calls: Array<{ url: string; body?: string }> = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body as string | undefined;
    calls.push({ url: String(url), ...(body !== undefined ? { body } : {}) });
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }) as typeof fetch;

  const appWithFetch = makeTestApp({ accountFetchImpl: fetchImpl });
  const res = await request(appWithFetch).delete('/v1/account').set(authHeader(u.token));

  expect(res.status).toBe(200);
  expect(res.body).toEqual({ success: true, data: { deleted: true } });

  expect(calls).toHaveLength(1);
  expect(calls[0]?.url).toBe('https://appleid.apple.com/auth/revoke');
  const body = new URLSearchParams(calls[0]?.body ?? '');
  expect(body.get('token')).toBe('rt_stored_abc');

  // The row itself is gone (belt-and-braces delete alongside the FK cascade).
  expect(__fakeStoreForTests.appleCredentials.has(u.id)).toBe(false);
  expect(__fakeStoreForTests.deletedAuthUsers.has(u.id)).toBe(true);
});

it('configured + revoke fetch fails: deletion still succeeds (best-effort revocation)', async () => {
  setAppleEnv();
  const u = await seedUser();
  __fakeStoreForTests.appleCredentials.set(u.id, {
    user_id: u.id,
    refresh_token: 'rt_stored_xyz',
    updated_at: new Date().toISOString(),
  });

  const fetchImpl = (async () => ({ ok: false, json: async () => ({}) }) as unknown as Response) as typeof fetch;
  const appWithFetch = makeTestApp({ accountFetchImpl: fetchImpl });

  const res = await request(appWithFetch).delete('/v1/account').set(authHeader(u.token));

  expect(res.status).toBe(200);
  expect(res.body).toEqual({ success: true, data: { deleted: true } });
  expect(__fakeStoreForTests.deletedAuthUsers.has(u.id)).toBe(true);
});

it('no stored token: no revoke call is made, deletion proceeds', async () => {
  setAppleEnv();
  const u = await seedUser();
  // No apple_credentials row seeded for this user.

  let fetchCalled = false;
  const fetchImpl = (async () => {
    fetchCalled = true;
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }) as typeof fetch;

  const appWithFetch = makeTestApp({ accountFetchImpl: fetchImpl });
  const res = await request(appWithFetch).delete('/v1/account').set(authHeader(u.token));

  expect(res.status).toBe(200);
  expect(fetchCalled).toBe(false);
  expect(__fakeStoreForTests.deletedAuthUsers.has(u.id)).toBe(true);
});
