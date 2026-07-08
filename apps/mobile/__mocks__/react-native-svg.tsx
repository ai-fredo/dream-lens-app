/**
 * Global jest mock for react-native-svg — the native module isn't available
 * under jest-expo, so any test that transitively imports EmotionArcChart.tsx
 * needs this. Kept minimal and honest: each primitive is a thin
 * `View`/plain-element pass-through that forwards its props verbatim (incl.
 * testID) so tests can assert on exactly the props the component sets
 * (cx/cy/r/fill for circles, points/stroke/strokeWidth for polylines) without
 * the mock inventing any rendering behavior of its own.
 */
import React from 'react';
import { View } from 'react-native';

function passthrough(displayName: string) {
  function Component(props: Record<string, unknown>) {
    return <View {...props} />;
  }
  Component.displayName = displayName;
  return Component;
}

export const Svg = passthrough('Svg');
export const Circle = passthrough('Circle');
export const Polyline = passthrough('Polyline');
export const Line = passthrough('Line');
export const Path = passthrough('Path');
export const G = passthrough('G');
export const Rect = passthrough('Rect');

export default Svg;
