import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { InputField } from '../components/InputField';
import { PrimaryButton } from '../components/PrimaryButton';
import { TextButton } from '../components/TextButton';
import { Colors, Spacing, Typography } from '../design/tokens';
import { useAuthStore } from '../store/authStore';

export function AuthScreen() {
  const signIn = useAuthStore((state) => state.signIn);
  const signUp = useAuthStore((state) => state.signUp);

  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <View style={styles.container}>
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
  error: {
    ...Typography.body.sm,
    color: Colors.semantic.error,
  },
});
