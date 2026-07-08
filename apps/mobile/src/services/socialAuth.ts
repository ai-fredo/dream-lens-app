import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import type { Session } from '@supabase/supabase-js';
import { api } from './api';
import { supabase } from './supabase';

/**
 * Native ID-token social sign-in (engineering-standards §4A).
 *
 * Deliberately NOT the `signInWithOAuth` web-redirect flow — that bounces
 * the user through a browser and needs deep-link plumbing. Instead each
 * platform's native sheet (Sign in with Apple / Google's account chooser)
 * hands us a provider ID token directly, which we forward to Supabase via
 * `signInWithIdToken`. The backend needs no changes: `requireAuth` verifies
 * the resulting Supabase JWT the same way regardless of provider.
 *
 * CONSTRAINT: these flows require a custom dev client (native modules are
 * not present in Expo Go) and real Apple/Google provider credentials wired
 * up in the Supabase dashboard. The tests below mock both native SDKs at
 * the JS boundary; device verification against the real Apple sheet and
 * Google account chooser is pending and is NOT claimed as done here.
 */

/** Discriminated result so callers can distinguish "user backed out" from a real failure. */
export type SocialAuthResult = { type: 'success'; session: Session | null } | { type: 'cancelled' };

let googleConfigured = false;

function configureGoogleSignInOnce() {
  if (googleConfigured) return;
  GoogleSignin.configure({
    // The Web client ID is the audience Supabase validates the Google ID
    // token against — REQUIRED even on iOS. It must match the value
    // configured in the Supabase dashboard (Authentication → Providers →
    // Google → Client ID), or Supabase rejects the token with "Invalid
    // audience". The iOS client ID is separate and only scopes which
    // native app can request tokens.
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });
  googleConfigured = true;
}

export async function signInWithApple(): Promise<SocialAuthResult> {
  // Raw nonce we control, plus its SHA-256 hash sent to Apple. Apple signs
  // the hash into the identity token; Supabase re-hashes the raw nonce we
  // send it and compares — this round trip is what stops a replayed
  // identity token from being accepted for a different sign-in attempt.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    const identityToken = credential.identityToken;
    if (!identityToken) {
      throw new Error('Apple returned no identity token');
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: identityToken,
      nonce: rawNonce,
    });
    if (error) {
      throw new Error(`Supabase rejected the Apple token: ${error.message}`);
    }

    // Capture the one-time Apple authorizationCode so the server can revoke
    // it with Apple if the user later deletes their account — Apple never
    // hands this out again after the sign-in that produced it. This is
    // deliberately fire-and-forget: it must never add latency to sign-in
    // and must never fail the sign-in if the API is unreachable, so we
    // don't await it and swallow any rejection with .catch(() => {}).
    if (credential.authorizationCode && data.session?.access_token) {
      api
        .post('/v1/auth/apple/authorization', { authorizationCode: credential.authorizationCode })
        .catch(() => {});
    }

    // Apple returns fullName/email ONLY on the very first authorization for
    // a given Apple ID — every subsequent sign-in sends null. Persist it
    // now or it's unrecoverable without the user revoking + re-authorizing
    // in iOS Settings.
    if (credential.fullName?.givenName && data.session?.user) {
      await supabase
        .from('user_profiles')
        .update({ display_name: credential.fullName.givenName })
        .eq('id', data.session.user.id);
    }

    return { type: 'success', session: data.session };
  } catch (err: unknown) {
    if (err instanceof Error && (err as { code?: string }).code === 'ERR_REQUEST_CANCELED') {
      return { type: 'cancelled' }; // user backed out — not an error
    }
    throw err;
  }
}

export async function signInWithGoogle(): Promise<SocialAuthResult> {
  configureGoogleSignInOnce();

  try {
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();

    if (response.type === 'cancelled') {
      return { type: 'cancelled' }; // user backed out — not an error
    }

    const idToken = response.data.idToken;
    if (!idToken) {
      throw new Error('Google returned no ID token');
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });
    if (error) {
      throw new Error(`Supabase rejected the Google token: ${error.message}`);
    }

    return { type: 'success', session: data.session };
  } catch (err: unknown) {
    if (err instanceof Error && (err as { code?: string }).code === statusCodes.SIGN_IN_CANCELLED) {
      return { type: 'cancelled' }; // user backed out — not an error
    }
    throw err;
  }
}
