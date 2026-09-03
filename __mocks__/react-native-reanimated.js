/**
 * A minimal stand-in for the reanimated API surface `LevelMeter`
 * actually uses.
 *
 * The package's own `mock.js` pulls in its native (`.native.ts`)
 * entry point transitively — which in turn touches the Worklets
 * runtime and fails outside a real device/simulator. RNTL only
 * needs the shared-value contract itself to render, so this avoids
 * the native path entirely rather than fighting module resolution.
 */
const React = require('react');
const { View } = require('react-native');

function useSharedValue(initial) {
  return React.useRef({ value: initial }).current;
}

function useAnimatedStyle(factory) {
  return factory();
}

function withTiming(toValue) {
  return toValue;
}

module.exports = {
  __esModule: true,
  default: { View },
  useSharedValue,
  useAnimatedStyle,
  withTiming,
};
