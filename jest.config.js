module.exports = {
  preset: '@react-native/jest-preset',
  resolver: 'react-native-worklets/jest/resolver.js',
  setupFiles: ['react-native-gesture-handler/jestSetup'],
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
