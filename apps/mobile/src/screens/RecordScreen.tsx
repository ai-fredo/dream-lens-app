import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RecordButton, type RecordButtonState } from '../components/RecordButton';
import { TextButton } from '../components/TextButton';
import { Colors, Spacing, Typography } from '../design/tokens';
import { formatDateEyebrow } from '../utils/date';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * The product's most important screen (design spec Screen 1 / engineering
 * standards SECTION 10). Full-screen dark canvas, no navigation bar, no
 * card around the transcript — chrome-less by design.
 *
 * Recording lifecycle is entirely owned by useSpeechRecognition; this
 * component only translates hook state into the five RecordButton visual
 * states and drives navigation once a session ends:
 *   - 'denied'    -> PermissionExplainScreen (Settings deep link)
 *   - 'unavailable' -> "Type instead" routes straight to Review, empty transcript
 *   - 'stopped' + non-empty transcript -> Review { rawTranscript, recordedAt }
 *   - 'stopped' + empty transcript -> stays on screen, disabled hint
 */
export function RecordScreen() {
  const navigation = useNavigation<Nav>();
  const { state: sttState, transcript, start, stop } = useSpeechRecognition();

  const dateEyebrow = useMemo(() => formatDateEyebrow(new Date()), []);

  // recordedAt is captured once per stop, not recomputed on every render.
  const recordedAtRef = useRef<string | null>(null);
  useEffect(() => {
    if (sttState === 'listening') {
      recordedAtRef.current = null;
    } else if (sttState === 'stopped' && recordedAtRef.current === null) {
      recordedAtRef.current = new Date().toISOString();
    }
  }, [sttState]);

  useEffect(() => {
    if (sttState === 'denied') {
      navigation.navigate('PermissionExplain');
    }
  }, [sttState, navigation]);

  useEffect(() => {
    if (sttState === 'stopped' && transcript.trim().length > 0) {
      navigation.navigate('Review', {
        rawTranscript: transcript,
        recordedAt: recordedAtRef.current ?? new Date().toISOString(),
      });
    }
  }, [sttState, transcript, navigation]);

  const handleButtonPress = () => {
    if (sttState === 'listening') {
      stop();
    } else {
      start();
    }
  };

  const handleTypeInstead = () => {
    navigation.navigate('Review', { rawTranscript: '', recordedAt: new Date().toISOString() });
  };

  const buttonState: RecordButtonState =
    sttState === 'listening'
      ? 'recording'
      : sttState === 'stopped'
        ? transcript.trim().length > 0
          ? 'stopping'
          : 'disabled'
        : 'default';

  const hint =
    sttState === 'listening'
      ? 'Listening... tap to stop'
      : sttState === 'stopped'
        ? transcript.trim().length > 0
          ? 'Reviewing your dream'
          : 'Nothing recorded yet'
        : 'Tap to begin';

  const showTranscript = sttState === 'listening' || (sttState === 'stopped' && transcript.trim().length > 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>This morning&apos;s dream</Text>
        <Text style={styles.dateEyebrow}>{dateEyebrow}</Text>
      </View>

      <View style={styles.spacerTop} />

      <View style={styles.transcriptArea}>
        {showTranscript ? (
          <Text style={styles.transcriptText}>{transcript}</Text>
        ) : (
          <Text style={styles.placeholderText}>Speak when you&apos;re ready.</Text>
        )}
      </View>

      <View style={styles.buttonBlock}>
        {sttState === 'unavailable' ? (
          <TextButton label="Type instead" onPress={handleTypeInstead} tone="gold" />
        ) : (
          <>
            <RecordButton state={buttonState} onPress={handleButtonPress} testID="record-button" />
            <Text style={styles.hint}>{hint}</Text>
          </>
        )}
      </View>

      <View style={styles.flexSpacer} />

      <View style={styles.journalRow}>
        <TextButton label="Journal →" onPress={() => navigation.navigate('Journal')} tone="secondary" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.base,
    paddingHorizontal: Spacing[6],
    paddingTop: Spacing[4],
    paddingBottom: Spacing[10],
  },
  header: {
    marginTop: Spacing[6],
  },
  title: {
    ...Typography.display.sm,
    color: Colors.text.secondary,
  },
  dateEyebrow: {
    ...Typography.eyebrow.sm,
    color: Colors.text.muted,
    marginTop: Spacing[2],
  },
  spacerTop: {
    height: Spacing[10],
  },
  transcriptArea: {
    minHeight: 180,
    justifyContent: 'center',
  },
  placeholderText: {
    ...Typography.body.lg,
    fontStyle: 'italic',
    color: Colors.text.muted,
    textAlign: 'center',
  },
  transcriptText: {
    ...Typography.body.lg,
    fontStyle: 'italic',
    color: Colors.text.primary,
    textAlign: 'left',
  },
  buttonBlock: {
    marginTop: Spacing[8],
    alignItems: 'center',
    gap: Spacing[5],
  },
  hint: {
    ...Typography.body.sm,
    color: Colors.text.muted,
    textAlign: 'center',
  },
  flexSpacer: {
    flex: 1,
  },
  journalRow: {
    alignItems: 'flex-end',
  },
});
