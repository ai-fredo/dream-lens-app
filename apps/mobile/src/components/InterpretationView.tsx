import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';
import { Card } from './Card';
import { Pill } from './Pill';
import { TextButton } from './TextButton';
import { Colors, Spacing, Typography } from '../design/tokens';
import type { Interpretation } from '../hooks/useInterpretation';

export interface InterpretationViewProps {
  interpretation: Interpretation;
  recordedAt: string;
}

const MAX_SYMBOLS_SHOWN = 5;

/** "FRIDAY, JULY 4" — uppercase weekday + month + day, per design spec Screen 3. */
function formatDateEyebrow(date: Date): string {
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date);
  const month = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(date);
  return `${weekday}, ${month} ${date.getDate()}`.toUpperCase();
}

/**
 * Fades + rises a section into place per the design spec's sequential
 * reveal timings (§ANIMATION PRINCIPLES, "Interpretation reveal"). Reduced
 * motion collapses every section to a simultaneous, opacity-only fade — no
 * delay, no translateY — per the spec's mandatory reduced-motion rule.
 */
function useRevealStyle(delayMs: number, durationMs: number, reduceMotion: boolean) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(reduceMotion ? 0 : 8)).current;

  useEffect(() => {
    const animation = reduceMotion
      ? Animated.timing(opacity, { toValue: 1, duration: durationMs, delay: 0, useNativeDriver: true })
      : Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: durationMs, delay: delayMs, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0, duration: durationMs, delay: delayMs, useNativeDriver: true }),
        ]);
    animation.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  return reduceMotion
    ? { opacity }
    : { opacity, transform: [{ translateY }] };
}

export function InterpretationView({ interpretation, recordedAt }: InterpretationViewProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [showAllSymbols, setShowAllSymbols] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const dateEyebrow = useMemo(() => formatDateEyebrow(new Date(recordedAt)), [recordedAt]);

  const summaryStyle = useRevealStyle(0, 400, reduceMotion);
  const themesStyle = useRevealStyle(100, 300, reduceMotion);
  const symbolsStyle = useRevealStyle(250, 300, reduceMotion);
  const patternStyle = useRevealStyle(600, 300, reduceMotion);
  const questionsStyle = useRevealStyle(800, 300, reduceMotion);

  const visibleSymbols =
    showAllSymbols || interpretation.symbols.length <= MAX_SYMBOLS_SHOWN
      ? interpretation.symbols
      : interpretation.symbols.slice(0, MAX_SYMBOLS_SHOWN);
  const hasMoreSymbols = !showAllSymbols && interpretation.symbols.length > MAX_SYMBOLS_SHOWN;

  return (
    <View style={styles.container}>
      <View style={styles.toneRow}>
        <Pill label={interpretation.emotionalTone} tone="gold" testID="emotional-tone-pill" />
      </View>

      <Text style={styles.dateEyebrow}>{dateEyebrow}</Text>

      <Animated.View style={summaryStyle}>
        <Text style={styles.summary}>{interpretation.summary}</Text>
      </Animated.View>

      <View style={styles.divider} />

      <Animated.View style={themesStyle}>
        <Text style={styles.eyebrow}>Themes</Text>
        <View style={styles.pillsRow}>
          {interpretation.themes.map((theme) => (
            <Pill key={theme} label={theme} tone="gold" />
          ))}
        </View>
      </Animated.View>

      <Animated.View style={[symbolsStyle, styles.section]}>
        <Text style={styles.eyebrow}>In your dream</Text>
        <View style={styles.symbolList}>
          {visibleSymbols.map((s) => (
            <Card key={s.symbol} variant="symbol" testID={`symbol-card-${s.symbol}`}>
              <Text style={styles.symbolName}>{s.symbol.toUpperCase()}</Text>
              <Text style={styles.symbolInterpretation}>{s.interpretation}</Text>
            </Card>
          ))}
        </View>
        {hasMoreSymbols ? (
          <TextButton label="See all" onPress={() => setShowAllSymbols(true)} tone="gold" />
        ) : null}
      </Animated.View>

      {interpretation.patternNote != null ? (
        <Animated.View style={[patternStyle, styles.section]}>
          <Card variant="gold">
            <Text style={styles.patternEyebrow}>
              <Text accessibilityElementsHidden importantForAccessibility="no">
                {'✦ '}
              </Text>
              PATTERN
            </Text>
            <Text style={styles.patternNote}>{interpretation.patternNote}</Text>
          </Card>
        </Animated.View>
      ) : null}

      <Animated.View style={[questionsStyle, styles.section]}>
        <Text style={styles.eyebrow}>Questions to sit with</Text>
        <View style={styles.questionList}>
          {interpretation.questionsToReflectOn.map((q) => (
            <View key={q} style={styles.questionRow}>
              <Text style={styles.questionText}>{q}</Text>
            </View>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: Spacing[8],
  },
  toneRow: {
    alignItems: 'flex-end',
    marginBottom: Spacing[4],
  },
  dateEyebrow: {
    ...Typography.eyebrow.md,
    color: Colors.text.muted,
    marginBottom: Spacing[2],
  },
  summary: {
    ...Typography.display.md,
    color: Colors.text.primary,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: Colors.bg.border,
    marginVertical: Spacing[8],
  },
  section: {
    marginTop: Spacing[8] - Spacing[1],
  },
  eyebrow: {
    ...Typography.eyebrow.sm,
    color: Colors.text.muted,
    marginBottom: Spacing[3],
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  symbolList: {
    gap: 10,
  },
  symbolName: {
    ...Typography.label.lg,
    color: Colors.text.primary,
  },
  symbolInterpretation: {
    ...Typography.body.sm,
    color: Colors.text.secondary,
    marginTop: 6,
  },
  patternEyebrow: {
    ...Typography.eyebrow.sm,
    color: Colors.gold.primary,
  },
  patternNote: {
    ...Typography.body.md,
    color: Colors.text.primary,
    fontStyle: 'italic',
    marginTop: Spacing[3],
  },
  questionList: {
    gap: 14,
  },
  questionRow: {
    borderLeftWidth: 2,
    borderLeftColor: Colors.bg.border,
    paddingLeft: Spacing[4],
    paddingVertical: Spacing[2],
  },
  questionText: {
    ...Typography.body.md,
    color: Colors.text.secondary,
    fontStyle: 'italic',
  },
});
