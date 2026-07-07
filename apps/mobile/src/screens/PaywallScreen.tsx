import { View } from 'react-native';
import { Colors } from '../design/tokens';

/**
 * Placeholder for the Paywall screen (Task 12 replaces this with the real
 * RevenueCat-backed upgrade UI). Exists so ReviewScreen's 402/upgradeRequired
 * navigation (Task 7) has a concrete route to land on, following the same
 * pattern Task 5 used for the Record placeholder and Task 6 for the Journal
 * placeholder.
 */
export function PaywallScreen() {
  return <View testID="paywall-placeholder" style={{ flex: 1, backgroundColor: Colors.bg.base }} />;
}
