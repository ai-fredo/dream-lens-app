import { useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, Text, type TextStyle } from 'react-native';

export interface ButtonBaseProps {
  label: string;
  onPress: () => void;
  disabled?: boolean | undefined;
  testID?: string | undefined;
  /** Base shell style (size/shape/color) for the Pressable. */
  shellStyle: StyleProp<ViewStyle>;
  /** Applied on top of shellStyle while pressed. */
  pressedStyle?: StyleProp<ViewStyle> | undefined;
  /** Applied on top of shellStyle when disabled. */
  disabledStyle?: StyleProp<ViewStyle> | undefined;
  /** Style for the label Text. */
  labelStyle: StyleProp<TextStyle>;
}

/**
 * Internal shared shell for pressable button-like components (PrimaryButton,
 * OutlinedButton, TextButton). Owns the Pressable wiring — pressed-state
 * tracking, hitSlop, and accessibility props — so those components only need
 * to supply their own colors/typography/sizing.
 *
 * Not part of any public API — do not export from an index/barrel file.
 */
export function ButtonBase({
  label,
  onPress,
  disabled,
  testID,
  shellStyle,
  pressedStyle,
  disabledStyle,
  labelStyle,
}: ButtonBaseProps) {
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
      style={[shellStyle, pressed ? pressedStyle : null, disabled ? disabledStyle : null]}
    >
      <Text style={labelStyle}>{label}</Text>
    </Pressable>
  );
}
