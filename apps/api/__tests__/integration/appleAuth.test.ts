// apps/api/__tests__/integration/appleAuth.test.ts
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import {
  isAppleConfigured,
  makeAppleClientSecret,
  exchangeAuthorizationCode,
  revokeAppleToken,
} from '../../src/services/appleAuth';
import { DreamLensError } from '@dreamlens/shared/types/errors';
import { authHeader, seedUser, makeTestApp } from '../helpers';
import { __fakeStoreForTests } from '../helpers/fakeSupabase';

const APPLE_ENV_KEYS = ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY', 'APPLE_BUNDLE_ID'] as const;

/** Snapshot + restore the four APPLE_* env vars around each test so no test
 * ever reads or leaks real values from the (git-ignored) .env. */
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const key of APPLE_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of APPLE_ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

/** Sets all four APPLE_* env vars to throwaway test values, with a freshly
 * generated EC P-256 key (PEM newlines escaped as \n, exercising the
 * unescaping path in makeAppleClientSecret). */
function setAppleEnv(): void {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  process.env.APPLE_TEAM_ID = 'TEAMID1234';
  process.env.APPLE_KEY_ID = 'KEYID5678';
  process.env.APPLE_PRIVATE_KEY = pem.replace(/\n/g, '\\n');
  process.env.APPLE_BUNDLE_ID = 'com.dreamlens.app';
}

describe('isAppleConfigured', () => {
  it('is false when any of the four vars is missing', () => {
    expect(isAppleConfigured()).toBe(false);

    process.env.APPLE_TEAM_ID = 'TEAMID1234';
    expect(isAppleConfigured()).toBe(false);

    process.env.APPLE_KEY_ID = 'KEYID5678';
    expect(isAppleConfigured()).toBe(false);

    process.env.APPLE_PRIVATE_KEY = 'some-key';
    expect(isAppleConfigured()).toBe(false);
  });

  it('is true when all four vars are set', () => {
    setAppleEnv();
    expect(isAppleConfigured()).toBe(true);
  });
});

describe('makeAppleClientSecret', () => {
  it('returns a JWT signed ES256 with kid/iss/sub/aud/exp set correctly', () => {
    setAppleEnv();
    const token = makeAppleClientSecret();
    const decoded = jwt.decode(token, { complete: true });
    expect(decoded).not.toBeNull();
    expect(decoded?.header.alg).toBe('ES256');
    expect(decoded?.header.kid).toBe(process.env.APPLE_KEY_ID);

    const payload = decoded?.payload as jwt.JwtPayload;
    expect(payload.iss).toBe(process.env.APPLE_TEAM_ID);
    expect(payload.sub).toBe(process.env.APPLE_BUNDLE_ID);
    expect(payload.aud).toBe('https://appleid.apple.com');

    const nowSec = Math.floor(Date.now() / 1000);
    expect(payload.exp).toBeDefined();
    expect(payload.exp as number).toBeGreaterThan(nowSec);
    expect(payload.exp as number).toBeLessThanOrEqual(nowSec + 15 * 60 + 5);
  });
});

/** A fake `fetch` capturing the last call's url/init for assertions. */
function makeFakeFetch(
  response: { ok: boolean; json: () => Promise<unknown> },
): { fetchImpl: typeof fetch; calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), ...(init ? { init } : {}) });
    return response as unknown as Response;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe('exchangeAuthorizationCode', () => {
  it('posts form-encoded params to the token URL and returns refresh_token', async () => {
    setAppleEnv();
    const { fetchImpl, calls } = makeFakeFetch({ ok: true, json: async () => ({ refresh_token: 'rt_abc' }) });

    const refreshToken = await exchangeAuthorizationCode('the-code', fetchImpl);

    expect(refreshToken).toBe('rt_abc');
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe('https://appleid.apple.com/auth/token');
    expect(call.init?.method).toBe('POST');
    expect(call.init?.headers).toMatchObject({ 'Content-Type': 'application/x-www-form-urlencoded' });

    const body = new URLSearchParams(call.init?.body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('the-code');
    expect(body.get('client_id')).toBe(process.env.APPLE_BUNDLE_ID);
    expect(body.get('client_secret')).toBeTruthy();
  });

  it('throws DreamLensError(APPLE_EXCHANGE_FAILED) on non-200', async () => {
    setAppleEnv();
    const { fetchImpl } = makeFakeFetch({ ok: false, json: async () => ({}) });

    await expect(exchangeAuthorizationCode('the-code', fetchImpl)).rejects.toThrow(DreamLensError);
    await expect(exchangeAuthorizationCode('the-code', fetchImpl)).rejects.toMatchObject({
      code: 'APPLE_EXCHANGE_FAILED',
    });
  });
});

describe('revokeAppleToken', () => {
  it('posts form-encoded params to the revoke URL', async () => {
    setAppleEnv();
    const { fetchImpl, calls } = makeFakeFetch({ ok: true, json: async () => ({}) });

    await revokeAppleToken('rt_abc', fetchImpl);

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe('https://appleid.apple.com/auth/revoke');
    expect(call.init?.method).toBe('POST');

    const body = new URLSearchParams(call.init?.body as string);
    expect(body.get('token')).toBe('rt_abc');
    expect(body.get('token_type_hint')).toBe('refresh_token');
    expect(body.get('client_id')).toBe(process.env.APPLE_BUNDLE_ID);
    expect(body.get('client_secret')).toBeTruthy();
  });

  it('throws DreamLensError(APPLE_REVOKE_FAILED) on non-200', async () => {
    setAppleEnv();
    const { fetchImpl } = makeFakeFetch({ ok: false, json: async () => ({}) });

    await expect(revokeAppleToken('rt_abc', fetchImpl)).rejects.toThrow(DreamLensError);
    await expect(revokeAppleToken('rt_abc', fetchImpl)).rejects.toMatchObject({
      code: 'APPLE_REVOKE_FAILED',
    });
  });
});

// ---- POST /v1/auth/apple/authorization (route-level, supertest) ----

describe('POST /v1/auth/apple/authorization', () => {
  it('401 without bearer', async () => {
    const app = makeTestApp();
    const res = await request(app).post('/v1/auth/apple/authorization').send({ authorizationCode: 'abc' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
  });

  it('200 { stored: false } when Apple env is not configured, and no fetch call is made', async () => {
    // beforeEach already cleared APPLE_* env for this test file.
    let fetchCalled = false;
    const fetchImpl = (async () => {
      fetchCalled = true;
      return { ok: true, json: async () => ({}) } as unknown as Response;
    }) as typeof fetch;

    const app = makeTestApp({ appleFetchImpl: fetchImpl });
    const u = await seedUser();
    const res = await request(app)
      .post('/v1/auth/apple/authorization')
      .set(authHeader(u.token))
      .send({ authorizationCode: 'abc' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { stored: false } });
    expect(fetchCalled).toBe(false);
  });

  it('200 { stored: true } and upserts apple_credentials when configured + exchange succeeds', async () => {
    setAppleEnv();
    const fetchImpl = (async () =>
      ({ ok: true, json: async () => ({ refresh_token: 'rt_abc' }) }) as unknown as Response) as typeof fetch;

    const app = makeTestApp({ appleFetchImpl: fetchImpl });
    const u = await seedUser();
    const res = await request(app)
      .post('/v1/auth/apple/authorization')
      .set(authHeader(u.token))
      .send({ authorizationCode: 'abc' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { stored: true } });
    expect(__fakeStoreForTests.appleCredentials.get(u.id)?.refresh_token).toBe('rt_abc');

    // Upsert semantics: a second call replaces the stored token.
    const fetchImpl2 = (async () =>
      ({ ok: true, json: async () => ({ refresh_token: 'rt_xyz' }) }) as unknown as Response) as typeof fetch;
    const app2 = makeTestApp({ appleFetchImpl: fetchImpl2 });
    const res2 = await request(app2)
      .post('/v1/auth/apple/authorization')
      .set(authHeader(u.token))
      .send({ authorizationCode: 'abc2' });
    expect(res2.status).toBe(200);
    expect(__fakeStoreForTests.appleCredentials.get(u.id)?.refresh_token).toBe('rt_xyz');
  });

  it('502 APPLE_EXCHANGE_FAILED when Apple token exchange fails', async () => {
    setAppleEnv();
    const fetchImpl = (async () => ({ ok: false, json: async () => ({}) }) as unknown as Response) as typeof fetch;

    const app = makeTestApp({ appleFetchImpl: fetchImpl });
    const u = await seedUser();
    const res = await request(app)
      .post('/v1/auth/apple/authorization')
      .set(authHeader(u.token))
      .send({ authorizationCode: 'abc' });

    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('APPLE_EXCHANGE_FAILED');
  });

  it('400 VALIDATION_ERROR when authorizationCode is missing or empty', async () => {
    const app = makeTestApp();
    const u = await seedUser();

    const missing = await request(app).post('/v1/auth/apple/authorization').set(authHeader(u.token)).send({});
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('VALIDATION_ERROR');

    const empty = await request(app)
      .post('/v1/auth/apple/authorization')
      .set(authHeader(u.token))
      .send({ authorizationCode: '' });
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('VALIDATION_ERROR');
  });
});
