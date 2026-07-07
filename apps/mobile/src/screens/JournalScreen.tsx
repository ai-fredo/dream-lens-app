import { View } from 'react-native';
import { Colors } from '../design/tokens';

/**
 * Placeholder for the Journal screen (Task 9 replaces this with the real
 * dream list UI). Exists so RecordScreen's "Journal →" link has a concrete
 * route to land on, following the same pattern Task 5 used for the Record
 * placeholder it replaced.
 */
export function JournalScreen() {
  return <View testID="journal-placeholder" style={{ flex: 1, backgroundColor: Colors.bg.base }} />;
}
