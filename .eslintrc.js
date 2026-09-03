module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // `void somePromise()` is the idiomatic way to mark a promise as
    // deliberately fire-and-forget, and screens use it inside arrow
    // handlers (`onPress={() => void start()}`), where the statement
    // allowance does not reach.
    'no-void': 'off',
    // React Navigation's `tabBarIcon` is a render prop, not a
    // component; the rule cannot tell the two apart.
    'react/no-unstable-nested-components': ['warn', {allowAsProps: true}],
  },
};
