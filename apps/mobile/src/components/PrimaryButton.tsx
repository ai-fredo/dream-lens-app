import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Colors, Radius, Typography } from '../design/tokens';

export interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

export function PrimaryButton({ label, onPress, disabled, testID }: PrimaryButtonProps) {
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={[
        styles.button,
        pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: Radius.full,
    backgroundColor: Colors.gold.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  disabled: {
    opacity: 0.35,
  },
  label: {
    ...Typography.label.lg,
    color: Colors.bg.base,
  },
});
