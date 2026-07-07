import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Spacing, Typography } from '../design/tokens';
import { Pill } from './Pill';
import type { DisplayDream } from '../store/dreamStore';

export interface DreamRowProps {
  dream: DisplayDream;
  onPress: (dreamId: string) => void;
}

const MAX_SYMBOLS_SHOWN = 3;

/** "FRIDAY, JULY 4" — uppercase weekday + month + day. */
function formatDateEyebrow(date: Date): string {
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date);
  const month = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(date);
  return `${weekday}, ${month} ${date.getDate()}`.toUpperCase();
}

/**
 * A single row in the Journal's SectionList (design spec Screen 4).
 *
 * 76dp min height, bg.elevated, no border radius (continuous-list feel), 1dp
 * border-subtle bottom separator. The 4dp gold left edge only appears when
 * the dream's interpretation carries a patternNote — that's the row's one
 * "this dream connects to something bigger" signal. Pending (not-yet-synced)
 * rows are not tappable and show a muted "Waiting to sync" eyebrow instead of
 * the emotional-tone pill, since there's no interpretation yet to show a tone
 * for.
 */
export function DreamRow({ dream, onPress }: DreamRowProps) {
  const dateEyebrow = formatDateEyebrow(new Date(dream.recordedAt));
  const transcript = dream.editedTranscript ?? dream.rawTranscript;
  const hasPatternNote = dream.interpretation?.patternNote != null;
  const symbols = dream.interpretation?.symbols.slice(0, MAX_SYMBOLS_SHOWN) ?? [];

  return (
    <Pressable
      testID={`dream-row-${dream.id}`}
      onPress={() => onPress(dream.id)}
      disabled={dream.pending}
      style={styles.row}
    >
      {hasPatternNote ? <View testID={`pattern-edge-${dream.id}`} style={styles.patternEdge} /> : null}
      <View style={styles.content}>
        <View style={styles.topLine}>
          <Text style={styles.dateEyebrow}>{dateEyebrow}</Text>
          {dream.pending ? (
            <Text style={styles.waitingEyebrow}>Waiting to sync</Text>
          ) : dream.interpretation ? (
            <Pill label={dream.interpretation.emotionalTone} tone="gold" />
          ) : null}
        </View>

        <Text style={styles.transcript} numberOfLines={1}>
          &ldquo;{transcript}&rdquo;
        </Text>

        {symbols.length > 0 ? (
          <Text style={styles.symbols} numberOfLines={1}>
            {symbols.map((s) => s.symbol).join('  •  ')}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    minHeight: 76,
    backgroundColor: Colors.bg.elevated,
    borderBottomWidth: 1,
    borderBottomColor: Colors.bg.border,
  },
  patternEdge: {
    width: 4,
    backgroundColor: Colors.gold.primary,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    gap: Spacing[1],
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateEyebrow: {
    ...Typography.eyebrow.sm,
    color: Colors.text.muted,
  },
  waitingEyebrow: {
    ...Typography.eyebrow.sm,
    color: Colors.text.muted,
  },
  transcript: {
    ...Typography.body.md,
    color: Colors.text.secondary,
  },
  symbols: {
    ...Typography.eyebrow.sm,
    color: Colors.text.muted,
  },
});
