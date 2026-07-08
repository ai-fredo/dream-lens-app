import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { TextButton } from '../components/TextButton';
import { Colors, Spacing, Typography } from '../design/tokens';

export interface OnboardingFlowProps {
  /** Called once the user finishes onboarding, however they got there
   * (recording now or deferring via "Not today"). The caller is
   * responsible for persisting the `dreamlens.onboarded` flag and
   * routing onward. */
  onDone: () => void;
}

type Step = 1 | 2 | 3;

const PRIVACY_ROWS: Array<{ title: string; body: string }> = [
  {
    title: 'Your dreams are private.',
    body: 'Transcripts are encrypted. Nothing is shared. Audio is discarded immediately.',
  },
  {
    title: 'This is reflection, not therapy.',
    body: 'DreamLens helps you understand your dreams. It is not mental health care.',
  },
  {
    title: 'You control your data.',
    body: 'Delete your account and all dreams anytime from Settings.',
  },
];

/**
 * Three-screen first-run onboarding (design spec Screen 8). Copy is
 * verbatim from the design spec — do not paraphrase. Internal step state
 * drives which screen is shown; there is no swipe pager, matching the
 * brief's "internal step state" option.
 */
export function OnboardingFlow({ onDone }: OnboardingFlowProps) {
  const [step, setStep] = useState<Step>(1);

  return (
    <View style={styles.container}>
      {step === 1 ? (
        <View style={styles.screen1}>
          <View style={styles.hookCopy}>
            <Text style={styles.headline}>
              Every morning, your subconscious leaves you a message.
            </Text>
            <Text style={styles.subhead}>DreamLens reads it — and remembers every one.</Text>
          </View>
          <PrimaryButton label="Get started" onPress={() => setStep(2)} />
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.screen2}>
          <Text style={styles.title}>Before we begin</Text>
          <View style={styles.rows}>
            {PRIVACY_ROWS.map((row) => (
              <View key={row.title} style={styles.row}>
                <View style={styles.icon} />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{row.title}</Text>
                  <Text style={styles.rowBody}>{row.body}</Text>
                </View>
              </View>
            ))}
          </View>
          <PrimaryButton label="I understand, continue" onPress={() => setStep(3)} />
        </View>
      ) : null}

      {step === 3 ? (
        <View style={styles.screen3}>
          <View style={styles.recordCopy}>
            <Text style={styles.title}>Let's begin.</Text>
            <Text style={styles.subhead}>Do you remember a dream from last night?</Text>
          </View>
          <View style={styles.recordActions}>
            <PrimaryButton label="Record now" onPress={onDone} />
            <TextButton label="Not today" onPress={onDone} tone="secondary" />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.base,
  },
  screen1: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing[16],
    paddingHorizontal: Spacing[6],
  },
  hookCopy: {
    marginTop: Spacing[16],
    alignItems: 'center',
    gap: Spacing[4],
  },
  headline: {
    ...Typography.display.lg,
    color: Colors.text.primary,
    textAlign: 'center',
    maxWidth: 300,
  },
  subhead: {
    ...Typography.body.lg,
    color: Colors.text.secondary,
    textAlign: 'center',
    maxWidth: 280,
  },
  screen2: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing[6],
    gap: Spacing[8],
  },
  title: {
    ...Typography.display.md,
    color: Colors.text.primary,
  },
  rows: {
    gap: Spacing[4],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[4],
    padding: Spacing[4],
  },
  icon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.gold.primary,
  },
  rowText: {
    flex: 1,
    gap: Spacing[1],
  },
  rowTitle: {
    ...Typography.label.lg,
    color: Colors.text.primary,
  },
  rowBody: {
    ...Typography.body.sm,
    color: Colors.text.secondary,
  },
  screen3: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing[6],
    gap: Spacing[8],
  },
  recordCopy: {
    gap: Spacing[3],
  },
  recordActions: {
    gap: Spacing[3],
    alignItems: 'center',
  },
});
