import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { InputField } from '../components/InputField';
import { OutlinedButton } from '../components/OutlinedButton';
import { PrimaryButton } from '../components/PrimaryButton';
import { TextButton } from '../components/TextButton';
import { Colors, Spacing, Typography } from '../design/tokens';
import { useAuthStore } from '../store/authStore';

// Real provider failures (a non-cancellation throw from the native SDK or a
// Supabase rejection) all surface this single copy — we don't leak provider
// internals into the UI. Cancellation is handled separately and silently:
// the user backing out of the native sheet is not an error.
const SOCIAL_AUTH_ERROR = "Couldn't sign in. Try again or use email.";

export function AuthScreen() {
  const signIn = useAuthStore((state) => state.signIn);
  const signUp = useAuthStore((state) => state.signUp);
  const signInWithApple = useAuthStore((state) => state.signInWithApple);
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle);

  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  // Apple's sheet is iOS-only, and even on iOS the API can report
  // unavailable (e.g. unsupported OS version) — Apple rejects builds that
  // render the button without checking `isAvailableAsync()` first
  // (engineering-standards §4A). Guard against setState after unmount since
  // this resolves asynchronously.
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let mounted = true;
    AppleAuthentication.isAvailableAsync().then((available) => {
      if (mounted) setAppleAvailable(available);
    });
    return () => {
      mounted = false;
    };
  }, []);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'signIn') {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
    } catch {
      setError('Check your email and password.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAppleSignIn() {
    setError(null);
    setSubmitting(true);
    try {
      await signInWithApple();
    } catch {
      setError(SOCIAL_AUTH_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    setError(null);
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } catch {
      setError(SOCIAL_AUTH_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* Apple listed FIRST and iOS-only — Apple requires it be offered
          alongside any other third-party social login (Guideline 4.8), and
          rejects apps that don't give it top billing on iOS. Rendered only
          once isAvailableAsync() confirms the sheet actually works on this
          device, using Apple's own button component — a custom button
          fails review (engineering-standards §4A). */}
      {Platform.OS === 'ios' && appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE}
          cornerRadius={26}
          style={styles.appleButton}
          onPress={handleAppleSignIn}
          testID="auth-apple"
          accessibilityLabel="Continue with Apple"
        />
      ) : null}
      <OutlinedButton
        label="Continue with Google"
        onPress={handleGoogleSignIn}
        disabled={submitting}
        testID="auth-google"
      />
      <InputField
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        testID="auth-email"
      />
      <InputField
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
        autoCapitalize="none"
        testID="auth-password"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton
        label={mode === 'signIn' ? 'Sign in' : 'Sign up'}
        onPress={handleSubmit}
        disabled={submitting}
      />
      <TextButton
        label={mode === 'signIn' ? 'Create account' : 'Sign in instead'}
        onPress={() => {
          setError(null);
          setMode((current) => (current === 'signIn' ? 'signUp' : 'signIn'));
        }}
        tone="secondary"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing[6],
    gap: Spacing[4],
    backgroundColor: Colors.bg.base,
  },
  appleButton: {
    width: '100%',
    height: 52,
  },
  error: {
    ...Typography.body.sm,
    color: Colors.semantic.error,
  },
});
