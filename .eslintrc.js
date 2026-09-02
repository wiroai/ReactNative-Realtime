module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // `void somePromise()` is the idiomatic way to mark a promise as
    // deliberately fire-and-forget.
    'no-void': ['warn', {allowAsStatement: true}],
  },
};
