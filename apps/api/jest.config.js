/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleNameMapper: {
    '^@dreamlens/shared/(.*)$': '<rootDir>/../../packages/shared/$1',
  },
  testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
};
