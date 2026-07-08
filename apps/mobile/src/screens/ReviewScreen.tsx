import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { InputField } from '../components/InputField';
import { PrimaryButton } from '../components/PrimaryButton';
import { TextButton } from '../components/TextButton';
import { Colors, Spacing, Typography } from '../design/tokens';
import { dreams } from '../services/dreams';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type ReviewRoute = RouteProp<RootStackParamList, 'Review'>;

const TRANSCRIPT_MAX_LENGTH = 5000;

/** "Friday, July 4 at 6:23 AM" — weekday + month spelled out, no leading
 * zero on the day, 12-hour clock with AM/PM, per design spec Screen 2. */
function formatReviewTimestamp(date: Date): string {
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date);
  const month = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(date);
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(date);
  return `${weekday}, ${month} ${date.getDate()} at ${time}`;
}

/**
 * Screen 2 of the design spec: a brief, low-friction pause to correct
 * transcription errors before interpretation — one text field, one primary
 * action, minimal explanation.
 *
 * Submission is offline-first (dreams.submit, Task 7): the dream is always
 * queued locally first, then a sync is attempted. Outcomes:
 *  - synced + interpret   -> Interpretation{dreamId} (server owns the wait)
 *  - synced + save-only   -> Journal (already persisted)
 *  - offline/queued       -> Journal (pending row visible there; no error —
 *                            the transcript is safe)
 *  - 402 upgradeRequired  -> Paywall
 *
 * Error handling: per dreams.submit's contract, a thrown error only happens
 * *before* the dream is enqueued (the 5000-char validation), so nothing has
 * been persisted yet — show the inline error copy and stay on-screen so the
 * user can retry. Any failure *after* enqueue is swallowed by submit()
 * itself and returned as { queued: true }, which already routes to Journal
 * above — the transcript is safe in the queue either way.
 */
export function ReviewScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<ReviewRoute>();
  const { rawTranscript, recordedAt } = route.params;

  const [editedTranscript, setEditedTranscript] = useState(rawTranscript);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const dateEyebrow = 'DATE';
  const timestamp = formatReviewTimestamp(new Date(recordedAt));

  async function handleSubmit(interpret: boolean) {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      const result = await dreams.submit({
        rawTranscript,
        editedTranscript,
        recordedAt,
        interpret,
      });

      if ('syncedId' in result) {
        navigation.navigate('Interpretation', { dreamId: result.syncedId });
      } else if ('saved' in result) {
        navigation.navigate('Journal');
      } else if ('upgradeRequired' in result) {
        navigation.navigate('Paywall');
      } else {
        // { queued: true } — offline. The dream is safe in the local queue;
        // land on Journal where the pending row is visible. No error copy.
        navigation.navigate('Journal');
      }
    } catch {
      // Pre-enqueue failure only (see contract note above) — nothing was
      // persisted, so surface the error inline and let the user retry.
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.dateBlock}>
        <Text style={styles.eyebrow}>{dateEyebrow}</Text>
        <Text style={styles.timestamp}>{timestamp}</Text>
      </View>

      <View style={styles.headingBlock}>
        <Text style={styles.title}>Review your dream</Text>
        <Text style={styles.subtitle}>Correct any errors before interpretation</Text>
      </View>

      <InputField
        value={editedTranscript}
        onChangeText={setEditedTranscript}
        multiline
        maxLength={TRANSCRIPT_MAX_LENGTH}
        testID="review-transcript-input"
        style={styles.input}
      />

      <Text style={styles.hint}>
        Lightly edit any transcription errors. Meaning matters more than exact words.
      </Text>

      {submitError && (
        <Text style={styles.errorText} testID="review-submit-error">
          Something went wrong. Your transcript is safe — tap to try again.
        </Text>
      )}

      <View style={styles.flexSpacer} />

      <PrimaryButton
        label={submitting ? 'Saving...' : 'Interpret this dream'}
        onPress={() => handleSubmit(true)}
        disabled={submitting}
        testID="review-interpret-button"
      />
      <TextButton
        label="Save without interpreting"
        onPress={() => handleSubmit(false)}
        tone="secondary"
        disabled={submitting}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.base,
    paddingHorizontal: Spacing[6],
    paddingTop: Spacing[6],
    paddingBottom: Spacing[10],
  },
  dateBlock: {
    marginBottom: Spacing[5],
  },
  eyebrow: {
    ...Typography.eyebrow.sm,
    color: Colors.text.muted,
  },
  timestamp: {
    ...Typography.label.md,
    color: Colors.text.secondary,
    marginTop: Spacing[1],
  },
  headingBlock: {
    marginBottom: Spacing[6],
  },
  title: {
    ...Typography.display.sm,
    color: Colors.text.primary,
  },
  subtitle: {
    ...Typography.body.md,
    color: Colors.text.secondary,
    marginTop: Spacing[2],
  },
  input: {
    minHeight: 200,
    maxHeight: '55%',
  },
  hint: {
    ...Typography.body.sm,
    fontStyle: 'italic',
    color: Colors.text.muted,
    marginTop: Spacing[3],
  },
  errorText: {
    ...Typography.body.sm,
    color: Colors.semantic.error,
    marginTop: Spacing[3],
  },
  flexSpacer: {
    flex: 1,
  },
});
