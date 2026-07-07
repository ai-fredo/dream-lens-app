import { View } from 'react-native';
import { Colors } from '../design/tokens';

/**
 * Placeholder for the Profile screen (Task 11 replaces this with the real
 * profile/pattern-summary UI). Exists so JournalScreen's header-right
 * "Profile" link (Task 9) has a concrete route to land on, following the
 * same pattern Task 5 used for the Record placeholder.
 */
export function ProfileScreen() {
  return <View testID="profile-placeholder" style={{ flex: 1, backgroundColor: Colors.bg.base }} />;
}
