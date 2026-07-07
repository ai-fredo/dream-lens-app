import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet } from 'react-native';
import { Colors } from '../design/tokens';

export interface BreathingCircleProps {
  testID?: string;
}

const SIZE = 48;
const STATIC_OPACITY = 0.6;

export function BreathingCircle({ testID }: BreathingCircleProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) return;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.8,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, opacity]);

  if (reduceMotion) {
    return (
      <Animated.View
        testID={testID}
        style={[styles.circle, { opacity: STATIC_OPACITY }]}
      />
    );
  }

  return <Animated.View testID={testID} style={[styles.circle, { opacity }]} />;
}

const styles = StyleSheet.create({
  circle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 1,
    borderColor: Colors.gold.border,
  },
});
