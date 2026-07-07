import { View } from 'react-native';
import { Colors } from '../design/tokens';

/**
 * Placeholder for the Record screen (Task 6 replaces this with the real
 * capture UI). Exists so RootNavigator has a concrete signed-in home route
 * to land on. Renders on Colors.bg.base with no chrome — the Record screen
 * itself is `headerShown: false` at the navigator level.
 */
export function RecordScreen() {
  return <View testID="record-placeholder" style={{ flex: 1, backgroundColor: Colors.bg.base }} />;
}
