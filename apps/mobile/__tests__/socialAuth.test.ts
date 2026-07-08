// In-memory doubles for the native modules used by socialAuth. Deep native
// behavior (the actual Apple sheet, the actual Google account chooser) can
// only be exercised on a device with a custom dev client and real provider
// credentials — see "device verification pending" in the Task 13 report.
// These mocks stand in for the JS-level contracts the two SDKs document.

jest.mock('../src/services/supabase', () => ({
  supabase: {
    auth: {
      signInWithIdToken: jest.fn(),
    },
    from: jest.fn(() => ({
      update: jest.fn(() => ({
        eq: jest.fn().mockResolvedValue({ error: null }),
      })),
    })),
  },
}));

jest.mock('expo-apple-authentication', () => ({
  signInAsync: jest.fn(),
  AppleAuthenticationScope: {
    FULL_NAME: 0,
    EMAIL: 1,
  },
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(),
  digestStringAsync: jest.fn(),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex' },
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(),
    signIn: jest.fn(),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
  },
}));

import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { supabase } from '../src/services/supabase';
import { signInWithApple, signInWithGoogle } from '../src/services/socialAuth';

const mockSignInWithIdToken = supabase.auth.signInWithIdToken as jest.Mock;
const mockAppleSignInAsync = AppleAuthentication.signInAsync as jest.Mock;
const mockRandomUUID = Crypto.randomUUID as jest.Mock;
const mockDigestStringAsync = Crypto.digestStringAsync as jest.Mock;
const mockGoogleSignIn = GoogleSignin.signIn as jest.Mock;
const mockGoogleHasPlayServices = GoogleSignin.hasPlayServices as jest.Mock;
const mockFrom = supabase.from as jest.Mock;

describe('socialAuth', () => {
  beforeEach(() => {
    mockSignInWithIdToken.mockReset();
    mockAppleSignInAsync.mockReset();
    mockRandomUUID.mockReset();
    mockDigestStringAsync.mockReset();
    mockGoogleSignIn.mockReset();
    mockGoogleHasPlayServices.mockReset();
    mockFrom.mockClear();
  });

  describe('signInWithApple', () => {
    it('generates a raw nonce, hashes it for the Apple request, and passes identityToken + rawNonce to signInWithIdToken', async () => {
      mockRandomUUID.mockReturnValue('raw-nonce-uuid');
      mockDigestStringAsync.mockResolvedValue('hashed-nonce-hex');
      mockAppleSignInAsync.mockResolvedValue({
        identityToken: 'apple-identity-token',
        authorizationCode: 'apple-auth-code',
        fullName: { givenName: 'Alfredo' },
        email: 'alfredo@example.com',
        user: 'apple-user-id',
      });
      const session = { access_token: 'tok', user: { id: 'u1' } };
      mockSignInWithIdToken.mockResolvedValue({ data: { session }, error: null });

      const result = await signInWithApple();

      // hashed nonce goes to Apple's native request
      expect(mockAppleSignInAsync).toHaveBeenCalledWith(
        expect.objectContaining({ nonce: 'hashed-nonce-hex' }),
      );
      // raw nonce (not the hash) goes to Supabase alongside the identity token
      expect(mockSignInWithIdToken).toHaveBeenCalledWith({
        provider: 'apple',
        token: 'apple-identity-token',
        nonce: 'raw-nonce-uuid',
      });
      expect(result).toEqual({ type: 'success', session });
      // first-authorization name capture — Apple only sends it once, ever
      expect(mockFrom).toHaveBeenCalledWith('user_profiles');
      const updateCall = mockFrom.mock.results[0]?.value.update;
      expect(updateCall).toHaveBeenCalledWith({ display_name: 'Alfredo' });
      const eqCall = updateCall.mock.results[0]?.value.eq;
      expect(eqCall).toHaveBeenCalledWith('id', 'u1');
    });

    it('requests FULL_NAME and EMAIL scopes', async () => {
      mockRandomUUID.mockReturnValue('raw-nonce-uuid');
      mockDigestStringAsync.mockResolvedValue('hashed-nonce-hex');
      mockAppleSignInAsync.mockResolvedValue({
        identityToken: 'apple-identity-token',
        authorizationCode: null,
        fullName: null,
        email: null,
        user: 'apple-user-id',
      });
      mockSignInWithIdToken.mockResolvedValue({
        data: { session: { access_token: 'tok', user: { id: 'u1' } } },
        error: null,
      });

      await signInWithApple();

      expect(mockAppleSignInAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        }),
      );
    });

    it('returns a cancelled result (no throw) when the user backs out with ERR_REQUEST_CANCELED', async () => {
      mockRandomUUID.mockReturnValue('raw-nonce-uuid');
      mockDigestStringAsync.mockResolvedValue('hashed-nonce-hex');
      const cancelError = Object.assign(new Error('canceled'), { code: 'ERR_REQUEST_CANCELED' });
      mockAppleSignInAsync.mockRejectedValue(cancelError);

      const result = await signInWithApple();

      expect(result).toEqual({ type: 'cancelled' });
      expect(mockSignInWithIdToken).not.toHaveBeenCalled();
    });

    it('throws when Apple returns no identity token', async () => {
      mockRandomUUID.mockReturnValue('raw-nonce-uuid');
      mockDigestStringAsync.mockResolvedValue('hashed-nonce-hex');
      mockAppleSignInAsync.mockResolvedValue({
        identityToken: null,
        authorizationCode: null,
        fullName: null,
        email: null,
        user: 'apple-user-id',
      });

      await expect(signInWithApple()).rejects.toThrow();
      expect(mockSignInWithIdToken).not.toHaveBeenCalled();
    });

    it('throws when Supabase rejects the Apple token', async () => {
      mockRandomUUID.mockReturnValue('raw-nonce-uuid');
      mockDigestStringAsync.mockResolvedValue('hashed-nonce-hex');
      mockAppleSignInAsync.mockResolvedValue({
        identityToken: 'apple-identity-token',
        authorizationCode: null,
        fullName: null,
        email: null,
        user: 'apple-user-id',
      });
      mockSignInWithIdToken.mockResolvedValue({
        data: { session: null },
        error: { message: 'Invalid audience' },
      });

      await expect(signInWithApple()).rejects.toThrow();
    });
  });

  describe('signInWithGoogle', () => {
    it('checks Play Services and passes idToken to signInWithIdToken on success', async () => {
      mockGoogleHasPlayServices.mockResolvedValue(true);
      mockGoogleSignIn.mockResolvedValue({
        type: 'success',
        data: {
          idToken: 'google-id-token',
          user: { id: 'g1', email: 'g@example.com' },
        },
      });
      const session = { access_token: 'tok2', user: { id: 'u2' } };
      mockSignInWithIdToken.mockResolvedValue({ data: { session }, error: null });

      const result = await signInWithGoogle();

      expect(mockGoogleHasPlayServices).toHaveBeenCalled();
      expect(mockSignInWithIdToken).toHaveBeenCalledWith({
        provider: 'google',
        token: 'google-id-token',
      });
      expect(result).toEqual({ type: 'success', session });
    });

    it('returns a cancelled result (no throw) when the response type is cancelled', async () => {
      mockGoogleHasPlayServices.mockResolvedValue(true);
      mockGoogleSignIn.mockResolvedValue({ type: 'cancelled', data: null });

      const result = await signInWithGoogle();

      expect(result).toEqual({ type: 'cancelled' });
      expect(mockSignInWithIdToken).not.toHaveBeenCalled();
    });

    it('returns a cancelled result when GoogleSignin throws statusCodes.SIGN_IN_CANCELLED', async () => {
      mockGoogleHasPlayServices.mockResolvedValue(true);
      const cancelError = Object.assign(new Error('cancelled'), {
        code: statusCodes.SIGN_IN_CANCELLED,
      });
      mockGoogleSignIn.mockRejectedValue(cancelError);

      const result = await signInWithGoogle();

      expect(result).toEqual({ type: 'cancelled' });
      expect(mockSignInWithIdToken).not.toHaveBeenCalled();
    });

    it('throws when Google returns no idToken', async () => {
      mockGoogleHasPlayServices.mockResolvedValue(true);
      mockGoogleSignIn.mockResolvedValue({
        type: 'success',
        data: { idToken: null, user: { id: 'g1', email: 'g@example.com' } },
      });

      await expect(signInWithGoogle()).rejects.toThrow();
      expect(mockSignInWithIdToken).not.toHaveBeenCalled();
    });

    it('throws when Supabase rejects the Google token', async () => {
      mockGoogleHasPlayServices.mockResolvedValue(true);
      mockGoogleSignIn.mockResolvedValue({
        type: 'success',
        data: { idToken: 'google-id-token', user: { id: 'g1', email: 'g@example.com' } },
      });
      mockSignInWithIdToken.mockResolvedValue({
        data: { session: null },
        error: { message: 'Invalid audience' },
      });

      await expect(signInWithGoogle()).rejects.toThrow();
    });
  });
});
