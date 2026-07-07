import { StyleSheet, Text, View } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../design/tokens';

export interface PillProps {
  label: string;
  tone?: 'gold' | 'neutral';
  testID?: string;
}

export function Pill({ label, tone = 'gold', testID }: PillProps) {
  return (
    <View
      testID={testID}
      style={[styles.base, tone === 'gold' ? styles.gold : styles.neutral]}
    >
      <Text style={[styles.label, tone === 'gold' ? styles.goldText : styles.neutralText]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1],
    alignSelf: 'flex-start',
  },
  gold: {
    backgroundColor: Colors.gold.dim,
  },
  neutral: {
    backgroundColor: Colors.bg.elevated,
  },
  label: {
    ...Typography.eyebrow.sm,
  },
  goldText: {
    color: Colors.text.gold,
  },
  neutralText: {
    color: Colors.text.secondary,
  },
});
