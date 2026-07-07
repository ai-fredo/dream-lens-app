import * as ExpoHaptics from 'expo-haptics';

/**
 * Thin haptics wrappers mapped per engineering-standards §9:
 *   - recordStart        -> impactAsync(Medium)
 *   - recordStop          -> notificationAsync(Success)
 *   - interpretationReady -> impactAsync(Light)
 *   - error                -> notificationAsync(Error)
 *   - buttonPress          -> impactAsync(Light)
 *
 * This is a 6am experience — haptics confirm actions without requiring the
 * user to look at the screen. Callers should fire-and-forget; failures
 * (unsupported hardware, simulator, etc.) are swallowed rather than thrown,
 * since a missed haptic should never break the interaction it's confirming.
 */
export const haptics = {
  recordStart(): void {
    void ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  recordStop(): void {
    void ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success).catch(() => {});
  },
  interpretationReady(): void {
    void ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  error(): void {
    void ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Error).catch(() => {});
  },
  buttonPress(): void {
    void ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
};

export type Haptics = typeof haptics;
