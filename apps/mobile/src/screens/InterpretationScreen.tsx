import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { InterpretationView } from '../components/InterpretationView';
import { OutlinedButton } from '../components/OutlinedButton';
import { EmptyState } from '../components/EmptyState';
import { BreathingCircle } from '../components/BreathingCircle';
import { Colors, Spacing, Typography } from '../design/tokens';
import { useInterpretation } from '../hooks/useInterpretation';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type InterpretationRoute = RouteProp<RootStackParamList, 'Interpretation'>;

/**
 * Screen 3 of the design spec: the emotional payoff of the record -> review
 * -> interpret flow. Owns three states via useInterpretation (Task 8):
 *
 *  - loading: BreathingCircle + "Reading your dream" — nothing else (no
 *    percentage, no progress bar, no spinner) per spec.
 *  - error: exact copy + "Try again" (retry re-runs the whole GET/interpret
 *    flow) — the dream itself is already safely persisted server-side by
 *    this point, so the only thing that can fail here is *reading* it back.
 *  - content: InterpretationView (the reusable section stack, shared with
 *    EntryDetail in Task 10) + "Save to journal", which is purely
 *    navigational confirmation — the dream is already persisted, so this
 *    just takes the user to where it now lives.
 *
 * Only { dreamId } routes land here in the current flow (ReviewScreen always
 * navigates with a server id once synced); the `localDream` variant of the
 * route param is reserved for a future offline-interpretation path and is
 * intentionally not handled yet.
 */
export function InterpretationScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<InterpretationRoute>();
  const dreamId = 'dreamId' in route.params ? route.params.dreamId : '';

  const { status, dream, retry } = useInterpretation(dreamId);

  if (status === 'loading') {
    return (
      <View style={[styles.container, styles.centered]} testID="interpretation-loading">
        <BreathingCircle testID="interpretation-loading-circle" />
        <Text style={styles.loadingLabel}>Reading your dream</Text>
      </View>
    );
  }

  if (status === 'error' || dream?.interpretation == null) {
    return (
      <View style={[styles.container, styles.centered]}>
        <EmptyState
          title="Couldn't interpret your dream"
          body="Your dream is saved. Tap to try again when you're connected."
          actionLabel="Try again"
          onAction={retry}
          variant="error"
          testID="interpretation-error"
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <InterpretationView interpretation={dream.interpretation} recordedAt={dream.recordedAt} />
      <View style={styles.saveButton}>
        <OutlinedButton label="Save to journal" onPress={() => navigation.navigate('Journal')} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.base,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingLabel: {
    ...Typography.body.md,
    color: Colors.text.muted,
    marginTop: Spacing[5],
  },
  content: {
    paddingHorizontal: Spacing[6],
    paddingBottom: Spacing[12],
  },
  saveButton: {
    marginTop: Spacing[10],
  },
});
