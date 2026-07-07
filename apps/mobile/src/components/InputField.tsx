import { useState } from 'react';
import type { StyleProp, TextInputProps, TextStyle } from 'react-native';
import { StyleSheet, TextInput } from 'react-native';
import { Colors, Radius, Spacing, TouchTargets, Typography } from '../design/tokens';

export interface InputFieldProps extends Omit<TextInputProps, 'style' | 'onFocus' | 'onBlur'> {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  testID?: string;
  /** Optional overrides (e.g. per-screen min/max height) layered on top of the base style. */
  style?: StyleProp<TextStyle>;
  /** Optional caller hook fired on blur (e.g. save-on-blur fields), layered
   * on top of the component's own focus-ring bookkeeping. */
  onBlur?: () => void;
}

export function InputField({
  value,
  onChangeText,
  placeholder,
  multiline,
  testID,
  style,
  onBlur,
  ...rest
}: InputFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <TextInput
      testID={testID}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={Colors.text.muted}
      multiline={multiline}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        onBlur?.();
      }}
      accessibilityLabel={placeholder}
      hitSlop={8}
      style={[
        styles.base,
        multiline ? styles.multiline : null,
        { borderColor: focused ? Colors.gold.primary : Colors.bg.border },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    ...Typography.body.md,
    backgroundColor: Colors.bg.input,
    borderWidth: 1,
    borderColor: Colors.bg.border,
    borderRadius: Radius.md,
    color: Colors.text.primary,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    minHeight: TouchTargets.minimum,
  },
  multiline: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
});
