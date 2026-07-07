import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SecureStore from 'expo-secure-store';
import { Colors, Typography } from '../design/tokens';
import { AuthScreen } from '../screens/AuthScreen';
import { EntryDetailScreen } from '../screens/EntryDetailScreen';
import { InterpretationScreen } from '../screens/InterpretationScreen';
import { JournalScreen } from '../screens/JournalScreen';
import { OnboardingFlow } from '../screens/OnboardingFlow';
import { PaywallScreen } from '../screens/PaywallScreen';
import { PermissionExplainScreen } from '../screens/PermissionExplainScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { RecordScreen } from '../screens/RecordScreen';
import { ReviewScreen } from '../screens/ReviewScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { useAuthStore } from '../store/authStore';
import type { RootStackParamList } from './types';

const ONBOARDED_KEY = 'dreamlens.onboarded';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Root navigation gate.
 *
 * - status === 'loading' -> blank bg.base view (auth state not yet known).
 * - signedOut + not onboarded -> Onboarding (first run).
 * - signedOut + onboarded -> Auth.
 * - signedIn -> stack with Record as the initial/home route.
 *
 * The `dreamlens.onboarded` secure-store flag is read once on mount and
 * set when onboarding completes (either "Record now" or "Not today" —
 * both count as finishing onboarding per the design spec).
 */
export function RootNavigator() {
  const status = useAuthStore((state) => state.status);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    // Auth state isn't known yet — don't bother reading the onboarded flag
    // until we're past the loading state (and possibly signed in, in which
    // case onboarding is irrelevant anyway).
    if (status === 'loading') return;

    let cancelled = false;
    SecureStore.getItemAsync(ONBOARDED_KEY).then((value) => {
      if (!cancelled) setOnboarded(value === 'true');
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const handleOnboardingDone = useCallback(() => {
    SecureStore.setItemAsync(ONBOARDED_KEY, 'true');
    setOnboarded(true);
  }, []);

  if (status === 'loading' || (status === 'signedOut' && onboarded === null)) {
    return <View testID="root-navigator-loading" style={{ flex: 1, backgroundColor: Colors.bg.base }} />;
  }

  const showOnboarding = status === 'signedOut' && onboarded === false;

  return (
    <Stack.Navigator
      screenOptions={{
        headerTransparent: true,
        headerTitleStyle: { ...Typography.label.lg, color: Colors.text.primary },
        headerTintColor: Colors.text.primary,
        headerShadowVisible: false,
        headerTitleAlign: 'center',
      }}
    >
      {showOnboarding ? (
        <Stack.Screen name="Onboarding" options={{ headerShown: false }}>
          {() => <OnboardingFlow onDone={handleOnboardingDone} />}
        </Stack.Screen>
      ) : status === 'signedOut' ? (
        <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
      ) : (
        <>
          <Stack.Screen name="Record" component={RecordScreen} options={{ headerShown: false }} />
          <Stack.Screen
            name="PermissionExplain"
            component={PermissionExplainScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen name="Review" component={ReviewScreen} options={{ title: 'Your dream' }} />
          <Stack.Screen name="Interpretation" component={InterpretationScreen} />
          <Stack.Screen name="Journal" component={JournalScreen} options={{ title: 'Journal' }} />
          <Stack.Screen name="EntryDetail" component={EntryDetailScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="Paywall" component={PaywallScreen} options={{ headerShown: false }} />
        </>
      )}
    </Stack.Navigator>
  );
}
