import { View } from 'react-native';
import { Colors } from '../design/tokens';

/**
 * Placeholder for the EntryDetail screen (Task 10 replaces this with the
 * real single-dream detail view). Exists so JournalScreen's row-tap
 * navigation (Task 9) has a concrete route to land on, following the same
 * pattern Task 5 used for the Record placeholder and Task 6 for the Journal
 * placeholder.
 */
export function EntryDetailScreen() {
  return <View testID="entrydetail-placeholder" style={{ flex: 1, backgroundColor: Colors.bg.base }} />;
}
