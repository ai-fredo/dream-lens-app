import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { InputField } from '../components/InputField';
import { InterpretationView } from '../components/InterpretationView';
import { TextButton } from '../components/TextButton';
import { Colors, Spacing, Typography } from '../design/tokens';
import { useInterpretation } from '../hooks/useInterpretation';
import { api } from '../services/api';
import { formatFriendlyDate } from '../utils/date';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type EntryDetailRoute = RouteProp<RootStackParamList, 'EntryDetail'>;

const SAVED_LABEL_DURATION_MS = 2000;

type SaveState = 'idle' | 'saved' | 'error';

/**
 * Screen 5 of the design spec: a read-only look back at a past dream
 * (mirroring InterpretationScreen's section stack) plus one editable field —
 * private notes, which autosave on blur.
 *
 * Data: reuses useInterpretation with `interpretIfMissing: false` — viewing
 * an old, uninterpreted entry must never kick off an interpretation as a
 * side effect (unlike InterpretationScreen, which is reached right after
 * recording and interpreting is exactly the point).
 *
 * Content: an interpreted dream renders the full InterpretationView (shared
 * with InterpretationScreen). An uninterpreted dream instead shows a plain
 * "YOUR DREAM" transcript block (edited transcript if present, else raw).
 *
 * Notes: no save button — the InputField saves on blur via PUT, only when
 * the text actually changed. A transient "Saved" label appears for ~2s then
 * disappears; a failed save keeps the typed text and swaps the "Saved" label
 * for a "Couldn't save your note. Tap to retry." TextButton that retries the
 * same PUT.
 *
 * Header: inherits the stack's standard transparent header; the title is set
 * once the dream loads to the friendly formatted date (e.g. "Friday, July 4").
 */
export function EntryDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<EntryDetailRoute>();
  const dreamId = route.params.dreamId;

  const { status, dream } = useInterpretation(dreamId, { interpretIfMissing: false });

  const [notes, setNotes] = useState('');
  const [savedNotes, setSavedNotes] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const savedLabelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Save-token guard (same pattern as useInterpretation's loadToken): bumped
  // at the start of every saveNotes() call and on unmount (effect cleanup
  // below). After the PUT's await, a save bails out (no setState) unless the
  // ref still matches the token it captured — either because the component
  // unmounted, or a newer saveNotes() call (a later blur, or a retry)
  // superseded this one. This guarantees only the LATEST save can ever
  // update saveState/savedNotes, even if an earlier PUT resolves after a
  // later one (out-of-order network resolution).
  const saveToken = useRef(0);

  useEffect(() => {
    return () => {
      saveToken.current += 1;
    };
  }, []);

  useEffect(() => {
    const title = dream?.recordedAt ? formatFriendlyDate(dream.recordedAt) : undefined;
    if (title) navigation.setOptions({ title });
  }, [navigation, dream?.recordedAt]);

  useEffect(() => {
    if (dream) {
      setNotes(dream.notes ?? '');
      setSavedNotes(dream.notes ?? '');
    }
  }, [dream]);

  useEffect(() => {
    return () => {
      if (savedLabelTimer.current) clearTimeout(savedLabelTimer.current);
    };
  }, []);

  const saveNotes = useCallback(
    async (value: string) => {
      const token = ++saveToken.current;
      try {
        await api.put(`/v1/dreams/${dreamId}`, { notes: value });
        if (saveToken.current !== token) return;
        setSavedNotes(value);
        setSaveState('saved');
        if (savedLabelTimer.current) clearTimeout(savedLabelTimer.current);
        savedLabelTimer.current = setTimeout(() => {
          setSaveState('idle');
        }, SAVED_LABEL_DURATION_MS);
      } catch {
        if (saveToken.current !== token) return;
        setSaveState('error');
      }
    },
    [dreamId],
  );

  const handleBlur = useCallback(() => {
    if (notes === savedNotes) return;
    saveNotes(notes);
  }, [notes, savedNotes, saveNotes]);

  const handleRetry = useCallback(() => {
    // Retries always re-send the CURRENT `notes` state, not whatever text
    // was captured by the failed save's closure. Simplest correct rule: by
    // the time the user can tap retry, `notes` already reflects everything
    // they've typed (including edits made after the failure), so resending
    // it is always at least as fresh as re-sending the stale failed value.
    saveNotes(notes);
  }, [notes, saveNotes]);

  if (status === 'loading' || !dream) {
    return <View style={styles.container} testID="entry-detail-loading" />;
  }

  const transcript = dream.editedTranscript ?? dream.rawTranscript;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {dream.interpretation != null ? (
        <InterpretationView interpretation={dream.interpretation} recordedAt={dream.recordedAt} />
      ) : (
        <View>
          <Text style={styles.eyebrow}>YOUR DREAM</Text>
          <Text style={styles.transcript}>{transcript}</Text>
        </View>
      )}

      <View style={styles.notesSection}>
        <Text style={styles.eyebrow}>Your thoughts</Text>
        <InputField
          value={notes}
          onChangeText={setNotes}
          onBlur={handleBlur}
          placeholder="Add a reflection..."
          multiline
          testID="notes-input"
        />
        {saveState === 'saved' ? <Text style={styles.savedLabel}>Saved</Text> : null}
        {saveState === 'error' ? (
          <TextButton
            label="Couldn't save your note. Tap to retry."
            onPress={handleRetry}
            tone="secondary"
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.base,
  },
  content: {
    paddingHorizontal: Spacing[6],
    paddingTop: Spacing[8],
    paddingBottom: Spacing[12],
  },
  eyebrow: {
    ...Typography.eyebrow.sm,
    color: Colors.text.muted,
    marginBottom: Spacing[3],
  },
  transcript: {
    ...Typography.body.lg,
    color: Colors.text.secondary,
    fontStyle: 'italic',
  },
  notesSection: {
    marginTop: Spacing[10],
  },
  savedLabel: {
    ...Typography.label.sm,
    color: Colors.text.muted,
    marginTop: Spacing[2],
  },
});
