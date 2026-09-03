module.exports = {
  preset: '@react-native/jest-preset',
  resolver: 'react-native-worklets/jest/resolver.js',
  setupFiles: ['react-native-gesture-handler/jestSetup'],
  // Fakes and barrels are scaffolding; measuring them would let the
  // real numbers hide behind trivially covered lines.
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/support/**',
    '!src/**/index.ts',
  ],
  // A floor a few points under today's numbers (78 / 66 / 76 / 78):
  // it catches a change that drops a whole area, not a refactor
  // that moves a branch.
  coverageThreshold: {
    global: {
      statements: 75,
      branches: 62,
      functions: 72,
      lines: 75,
    },
  },
  transformIgnorePatterns: [
    'node_modules/(?!(' +
      '@react-native|react-native' +
      '|@react-navigation' +
      '|react-native-reanimated' +
      '|react-native-worklets' +
      '|react-native-gesture-handler' +
      '|react-native-screens' +
      '|react-native-safe-area-context' +
      '|react-native-paper' +
      '|@react-native-vector-icons' +
      '|@react-native-clipboard' +
      '|@noble' +
      ')/)',
  ],
};
