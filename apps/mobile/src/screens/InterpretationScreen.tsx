import { View } from 'react-native';
import { Colors } from '../design/tokens';

/**
 * Placeholder for the Interpretation screen (Task 8 replaces this with the
 * real interpretation UI — summary, themes, symbols, pattern note). Exists
 * so ReviewScreen's synced+interpret navigation (Task 7) has a concrete
 * route to land on, following the same pattern Task 5 used for the Record
 * placeholder and Task 6 for the Journal placeholder.
 */
export function InterpretationScreen() {
  return <View testID="interpretation-placeholder" style={{ flex: 1, backgroundColor: Colors.bg.base }} />;
}
