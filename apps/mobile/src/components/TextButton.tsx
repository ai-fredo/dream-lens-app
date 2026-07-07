import { StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '../design/tokens';
import { ButtonBase } from './ButtonBase';

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
    <ButtonBase
      label={label}
      onPress={onPress}
      testID={testID}
      shellStyle={styles.button}
      labelStyle={[styles.label, { color: toneColor[tone] }]}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[3],
  },
  label: {
    ...Typography.label.md,
  },
});
