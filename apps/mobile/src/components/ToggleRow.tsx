import { StyleSheet, Switch, Text, View } from 'react-native';
import { Colors, Spacing, Typography, TouchTargets } from '../design/tokens';

export interface ToggleRowProps {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID?: string;
}

export function ToggleRow({ label, value, onValueChange, testID }: ToggleRowProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Switch
        testID={testID}
        value={value}
        onValueChange={onValueChange}
        accessibilityRole="switch"
        accessibilityLabel={label}
        trackColor={{ false: Colors.bg.border, true: Colors.gold.primary }}
        thumbColor={value ? Colors.bg.base : Colors.text.primary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: TouchTargets.minimum,
    paddingVertical: Spacing[2],
  },
  label: {
    ...Typography.body.md,
    color: Colors.text.primary,
    flexShrink: 1,
  },
});
