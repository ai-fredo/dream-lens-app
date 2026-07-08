import { useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  createNavigationContainerRef,
  DarkTheme,
  NavigationContainer,
  type Theme,
} from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import {
  useFonts,
  CormorantGaramond_300Light,
  CormorantGaramond_300Light_Italic,
  CormorantGaramond_400Regular,
  CormorantGaramond_400Regular_Italic,
} from '@expo-google-fonts/cormorant-garamond';
import { Inter_300Light, Inter_400Regular, Inter_500Medium } from '@expo-google-fonts/inter';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { Colors } from './src/design/tokens';
import { RootNavigator } from './src/navigation/RootNavigator';
import { initTelemetry } from './src/services/telemetry';
import { useAuthStore } from './src/store/authStore';
import type { RootStackParamList } from './src/navigation/types';

// Env-gated Sentry init (no-op unless EXPO_PUBLIC_SENTRY_DSN is set) — must
// run once at module scope, before the tree renders, so any early render
// error is still covered.
initTelemetry();

// Dark navigation theme built from our own tokens — not React Navigation's
// DefaultTheme (light) and not its stock DarkTheme's colors, which don't
// match the DreamLens palette.
const navigationTheme: Theme = {
  ...DarkTheme,
  dark: true,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.gold.primary,
    background: Colors.bg.base,
    card: Colors.bg.base,
    text: Colors.text.primary,
    border: Colors.bg.border,
    notification: Colors.semantic.error,
  },
};

// Module-level ref so the notification-response listener (registered once,
// outside any screen) can reach the navigator without needing a route to
// deep-link to. Record IS the signed-in home screen (see RootNavigator), so
// there's no dedicated deep-link target — tapping the reminder just brings
// the user to Record.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export default function App() {
  const [fontsLoaded] = useFonts({
    CormorantGaramond_300Light,
    CormorantGaramond_300Light_Italic,
    CormorantGaramond_400Regular,
    CormorantGaramond_400Regular_Italic,
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
  });
  const status = useAuthStore((state) => state.status);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(() => {
      // Only navigate if the container has finished mounting and the user
      // is actually signed in — Record is a signed-in-only route, and
      // navigating into a stack that hasn't rendered it yet would throw.
      if (!navigationRef.isReady()) return;
      if (status !== 'signedIn') return;
      navigationRef.reset({ index: 0, routes: [{ name: 'Record' }] });
    });
    return () => subscription.remove();
  }, [status]);

  // Blank dark screen while fonts load — never show system fonts.
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: Colors.bg.base }} />;
  return (
    <View testID="app-root" style={{ flex: 1, backgroundColor: Colors.bg.base }}>
      <StatusBar style="light" />
      <ErrorBoundary>
        <NavigationContainer ref={navigationRef} theme={navigationTheme}>
          <RootNavigator />
        </NavigationContainer>
      </ErrorBoundary>
    </View>
  );
}
