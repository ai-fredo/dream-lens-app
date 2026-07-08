import { StyleSheet, Text } from 'react-native';
import { Colors, Spacing, Typography } from '../design/tokens';
import { Card } from './Card';

export interface ClusterCardProps {
  label: string;
  topSymbols: string[];
  dreamCount: number;
  testID?: string;
}

/** One recurring-theme cluster card (default Card variant). */
export function ClusterCard({ label, topSymbols, dreamCount, testID }: ClusterCardProps) {
  return (
    <Card {...(testID ? { testID } : {})}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.count}>{`×${dreamCount}`}</Text>
      {topSymbols.length > 0 ? <Text style={styles.symbols}>{topSymbols.join(', ')}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  label: {
    ...Typography.label.md,
    color: Colors.text.primary,
  },
  count: {
    ...Typography.display.sm,
    color: Colors.gold.primary,
    marginTop: Spacing[1],
  },
  symbols: {
    ...Typography.eyebrow.sm,
    color: Colors.text.muted,
    marginTop: Spacing[2],
  },
});
