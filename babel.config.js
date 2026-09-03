module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // Must stay last — see the Reanimated 4 / Worklets migration guide.
  plugins: ['react-native-worklets/plugin'],
};
