import { useState } from 'react';
import type { TextInputProps } from 'react-native';
import { StyleSheet, TextInput } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../design/tokens';

export interface InputFieldProps extends Omit<TextInputProps, 'style' | 'onFocus' | 'onBlur'> {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  testID?: string;
}

export function InputField({
  value,
  onChangeText,
  placeholder,
  multiline,
  testID,
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
      onBlur={() => setFocused(false)}
      accessibilityLabel={placeholder}
      hitSlop={8}
      style={[
        styles.base,
        multiline ? styles.multiline : null,
        { borderColor: focused ? Colors.gold.primary : Colors.bg.border },
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
    minHeight: 56,
  },
  multiline: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
});
