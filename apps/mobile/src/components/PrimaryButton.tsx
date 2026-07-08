import { StyleSheet } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../design/tokens';
import { ButtonBase } from './ButtonBase';

export interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

export function PrimaryButton({ label, onPress, disabled, testID }: PrimaryButtonProps) {
  return (
    <ButtonBase
      label={label}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      shellStyle={styles.button}
      pressedStyle={styles.pressed}
      disabledStyle={styles.disabled}
      labelStyle={styles.label}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: Radius.full,
    backgroundColor: Colors.gold.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[6],
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
