/**
 * Global jest mock for expo-haptics — no-ops under test per the Task 6
 * brief ("haptics.recordStart/recordStop/... — thin wrappers ... no-ops
 * under test"). The native module isn't available under jest-expo, so any
 * test that transitively imports src/services/haptics.ts needs this.
 */
export enum NotificationFeedbackType {
  Success = 'success',
  Warning = 'warning',
  Error = 'error',
}

export enum ImpactFeedbackStyle {
  Light = 'light',
  Medium = 'medium',
  Heavy = 'heavy',
  Rigid = 'rigid',
  Soft = 'soft',
}

export enum AndroidHaptics {
  Confirm = 'confirm',
}

export const notificationAsync = jest.fn(() => Promise.resolve());
export const impactAsync = jest.fn(() => Promise.resolve());
export const selectionAsync = jest.fn(() => Promise.resolve());
export const performAndroidHapticsAsync = jest.fn(() => Promise.resolve());
