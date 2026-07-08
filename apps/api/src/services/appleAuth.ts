// apps/api/src/services/appleAuth.ts
import jwt from 'jsonwebtoken';
import { DreamLensError } from '@dreamlens/shared/types/errors';

const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';

/** All four Apple env vars present → revocation feature is enabled. */
export function isAppleConfigured(): boolean {
  return Boolean(
    process.env.APPLE_TEAM_ID &&
      process.env.APPLE_KEY_ID &&
      process.env.APPLE_PRIVATE_KEY &&
      process.env.APPLE_BUNDLE_ID
  );
}

/**
 * Apple client secret: an ES256 JWT signed with the "Sign in with Apple" key
 * from the developer portal. Short-lived — minted per request (Apple allows
 * up to 6 months; we never need more than one call's lifetime).
 */
export function makeAppleClientSecret(): string {
  const privateKey = (process.env.APPLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
  return jwt.sign({}, privateKey, {
    algorithm: 'ES256',
    keyid: process.env.APPLE_KEY_ID,
    issuer: process.env.APPLE_TEAM_ID,
    subject: process.env.APPLE_BUNDLE_ID,
    audience: 'https://appleid.apple.com',
    expiresIn: '15m',
  });
}

/** Exchange the sign-in authorizationCode for Apple's long-lived refresh_token. */
export async function exchangeAuthorizationCode(
  code: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const res = await fetchImpl(APPLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: process.env.APPLE_BUNDLE_ID ?? '',
      client_secret: makeAppleClientSecret(),
    }).toString(),
  });
  if (!res.ok) {
    // Never log the code or response body — treat everything Apple-side as opaque.
    throw new DreamLensError('APPLE_EXCHANGE_FAILED', 'Apple token exchange failed');
  }
  const body = (await res.json()) as { refresh_token?: string };
  if (!body.refresh_token) {
    throw new DreamLensError('APPLE_EXCHANGE_FAILED', 'Apple token exchange returned no refresh token');
  }
  return body.refresh_token;
}

/** Revoke a stored refresh token (called during account deletion). */
export async function revokeAppleToken(
  refreshToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const res = await fetchImpl(APPLE_REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      token: refreshToken,
      token_type_hint: 'refresh_token',
      client_id: process.env.APPLE_BUNDLE_ID ?? '',
      client_secret: makeAppleClientSecret(),
    }).toString(),
  });
  if (!res.ok) {
    throw new DreamLensError('APPLE_REVOKE_FAILED', 'Apple token revocation failed');
  }
}
