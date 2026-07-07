import { Pressable, StyleSheet, Text } from 'react-native';
import { Colors, Typography } from '../design/tokens';

export interface TextButtonProps {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'secondary' | 'gold';
  testID?: string;
}

const toneColor = {
  primary: Colors.text.primary,
  secondary: Colors.text.secondary,
  gold: Colors.text.gold,
} as const;

export function TextButton({ label, onPress, tone = 'primary', testID }: TextButtonProps) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.button}
    >
      <Text style={[styles.label, { color: toneColor[tone] }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  label: {
    ...Typography.label.md,
  },
});
