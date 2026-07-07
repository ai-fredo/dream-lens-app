module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@supabase/.*|zustand)',
  ],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  // The first test of a large screen suite pays cold-start module compilation
  // under coverage instrumentation; on slow CI runners that alone can exceed
  // Jest's 5s default (observed: EntryDetailScreen suite flaking on the push
  // runner while passing on the PR runner, same SHA). 15s keeps hangs
  // detectable while absorbing cold starts.
  testTimeout: 15000,
};
