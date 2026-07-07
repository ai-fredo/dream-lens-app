import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View } from 'react-native';
import { Colors } from '../design/tokens';

export type RecordButtonState = 'default' | 'press' | 'recording' | 'stopping' | 'disabled';

export interface RecordButtonProps {
  state: RecordButtonState;
  onPress: () => void;
  testID?: string;
}

// Design spec, Screen 1 "Record Button States" — the most specified element
// in the document. Values below are law; do not round or simplify them.
const BUTTON_SIZE = 96;
const TAP_AREA_SIZE = 128;
const RING_MAX_SIZE = 120;
const PULSE_DURATION_MS = 1600;

/**
 * The record button: five visual states (default/press/recording/stopping/
 * disabled), a 96dp visible circle inside a 128dp transparent tap area, and
 * — while recording — a single pulse ring (96dp -> 120dp, opacity 0.6 -> 0,
 * 1600ms, repeating) drawn around the button, never animating the button
 * itself. Under reduced motion, the ring is replaced with a border-opacity
 * pulse on the button border instead of a growing ring.
 */
export function RecordButton({ state, onPress, testID }: RecordButtonProps) {
  const [pressed, setPressed] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  const ringScale = useRef(new Animated.Value(0)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;
  const borderPulseOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const recording = state === 'recording';

  useEffect(() => {
    if (!recording) return;

    if (reduceMotion) {
      borderPulseOpacity.setValue(1);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(borderPulseOpacity, {
            toValue: 0.4,
            duration: PULSE_DURATION_MS / 2,
            useNativeDriver: true,
          }),
          Animated.timing(borderPulseOpacity, {
            toValue: 1,
            duration: PULSE_DURATION_MS / 2,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }

    ringScale.setValue(0);
    ringOpacity.setValue(0.6);
    const loop = Animated.loop(
      Animated.parallel([
        Animated.timing(ringScale, {
          toValue: 1,
          duration: PULSE_DURATION_MS,
          useNativeDriver: true,
        }),
        Animated.timing(ringOpacity, {
          toValue: 0,
          duration: PULSE_DURATION_MS,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [recording, reduceMotion, ringScale, ringOpacity, borderPulseOpacity]);

  const disabled = state === 'disabled';
  const label = state === 'recording' ? 'Stop recording' : 'Start recording';

  const circleStyle = [
    styles.circle,
    state === 'default' && styles.circleDefault,
    (state === 'press' || pressed) && state !== 'recording' && styles.circlePress,
    state === 'recording' && styles.circleRecording,
    state === 'stopping' && styles.circleStopping,
    disabled && styles.circleDisabled,
  ];

  return (
    <View style={styles.tapArea} testID={testID ? `${testID}-tap-area` : undefined}>
      {recording && !reduceMotion ? (
        <Animated.View
          pointerEvents="none"
          testID={testID ? `${testID}-pulse-ring` : undefined}
          style={[
            styles.pulseRing,
            {
              opacity: ringOpacity,
              transform: [
                {
                  scale: ringScale.interpolate({
                    inputRange: [0, 1],
                    outputRange: [BUTTON_SIZE / RING_MAX_SIZE, 1],
                  }),
                },
              ],
            },
          ]}
        />
      ) : null}
      <Pressable
        testID={testID}
        onPress={onPress}
        disabled={disabled}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        hitSlop={(TAP_AREA_SIZE - BUTTON_SIZE) / 2}
        style={styles.pressableCenter}
      >
        <Animated.View
          style={[
            circleStyle,
            recording && reduceMotion ? { borderColor: Colors.recording.active, opacity: borderPulseOpacity } : null,
          ]}
        >
          <RecordButtonIcon state={state} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

function RecordButtonIcon({ state }: { state: RecordButtonState }) {
  if (state === 'recording') {
    return <View style={styles.stopIcon} />;
  }
  if (state === 'stopping') {
    return (
      <View style={styles.checkmark}>
        <View style={styles.checkmarkShortLeg} />
        <View style={styles.checkmarkLongLeg} />
      </View>
    );
  }
  return <View style={styles.micIcon}>
    <View style={styles.micCapsule} />
    <View style={styles.micBase} />
  </View>;
}

const styles = StyleSheet.create({
  tapArea: {
    width: TAP_AREA_SIZE,
    height: TAP_AREA_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressableCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    borderWidth: 2,
    borderColor: Colors.recording.active,
  },
  circle: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg.elevated,
    borderWidth: 1.5,
    borderColor: Colors.gold.border,
  },
  circleDefault: {},
  circlePress: {
    borderColor: Colors.gold.primary,
    transform: [{ scale: 0.96 }],
  },
  circleRecording: {
    borderWidth: 2,
    borderColor: Colors.recording.active,
    backgroundColor: 'rgba(200,82,82,0.08)',
  },
  circleStopping: {
    borderWidth: 1.5,
    borderColor: Colors.gold.border,
    backgroundColor: Colors.bg.elevated,
  },
  circleDisabled: {
    opacity: 0.4,
  },
  micIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micCapsule: {
    width: 14,
    height: 20,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: Colors.gold.primary,
  },
  micBase: {
    marginTop: 3,
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: Colors.gold.primary,
  },
  stopIcon: {
    width: 20,
    height: 20,
    borderRadius: 3,
    backgroundColor: Colors.recording.active,
  },
  checkmark: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmarkShortLeg: {
    position: 'absolute',
    width: 2,
    height: 8,
    borderRadius: 1,
    backgroundColor: Colors.gold.primary,
    transform: [{ rotate: '45deg' }, { translateX: -5 }, { translateY: 2 }],
  },
  checkmarkLongLeg: {
    position: 'absolute',
    width: 2,
    height: 14,
    borderRadius: 1,
    backgroundColor: Colors.gold.primary,
    transform: [{ rotate: '-45deg' }, { translateX: 3 }, { translateY: -2 }],
  },
});
