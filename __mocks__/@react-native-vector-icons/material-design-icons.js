/**
 * The real package resolves its glyph map through a native font
 * module, which is absent under Jest; without this stand-in Paper
 * falls back to a warning-per-icon and floods the test output.
 * Rendering the glyph name as text keeps icons queryable in RNTL.
 */
const React = require('react');
const { Text } = require('react-native');

function MaterialDesignIcon({ name, testID }) {
  return React.createElement(
    Text,
    { testID, accessibilityRole: 'image' },
    name,
  );
}

module.exports = {
  __esModule: true,
  default: MaterialDesignIcon,
};
