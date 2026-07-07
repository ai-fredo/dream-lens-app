import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Colors, Radius, Typography } from '../design/tokens';

export interface OutlinedButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

export function OutlinedButton({ label, onPress, disabled, testID }: OutlinedButtonProps) {
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
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.bg.borderStrong,
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
    color: Colors.text.primary,
  },
});
