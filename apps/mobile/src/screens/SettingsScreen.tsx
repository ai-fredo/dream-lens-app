import { View } from 'react-native';
import { Colors } from '../design/tokens';

/**
 * Placeholder for the Settings screen (Task 12 replaces this with the real
 * settings UI). Exists so JournalScreen's header-right "Settings" link
 * (Task 9) has a concrete route to land on, following the same pattern
 * Task 5 used for the Record placeholder.
 */
export function SettingsScreen() {
  return <View testID="settings-placeholder" style={{ flex: 1, backgroundColor: Colors.bg.base }} />;
}
