/**
 * Global jest mock for expo-speech-recognition. The package's native module
 * (ExpoSpeechRecognition) doesn't exist under jest-expo's Node environment,
 * so any test that transitively imports it (e.g. via RootNavigator ->
 * RecordScreen -> useSpeechRecognition) needs this auto-mock even when the
 * test itself doesn't care about speech recognition behavior.
 *
 * Tests that exercise useSpeechRecognition directly (see
 * __tests__/useSpeechRecognition.test.ts) install their own more detailed
 * jest.mock('expo-speech-recognition', ...) which takes precedence.
 */
export const ExpoSpeechRecognitionModule = {
  start: jest.fn(),
  stop: jest.fn(),
  abort: jest.fn(),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false, status: 'denied' })),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false, status: 'denied' })),
  isRecognitionAvailable: jest.fn(() => true),
  getStateAsync: jest.fn(() => Promise.resolve('inactive')),
  addListener: jest.fn(() => ({ remove: jest.fn() })),
};

export function useSpeechRecognitionEvent(): void {
  // No-op by default; hook-level tests provide their own mock.
}
