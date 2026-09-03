import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from 'react-native-paper';

/**
 * Either a fixed 0–1 amplitude or a sampler the meter polls itself.
 * A sampler must be referentially stable across renders (wrap it in
 * `useCallback`), otherwise the polling timer restarts every render.
 */
export type AmplitudeSource = number | (() => number);

export interface LevelMeterProps {
  readonly amplitude: AmplitudeSource;
  readonly testID?: string;
}

const BAR_COUNT = 24;
const MIN_SCALE = 0.12;
const SAMPLE_PERIOD_MS = 50;

/**
 * The stage's animated level meter: a row of bars whose heights
 * track the sampled amplitude, standing in for the Compose
 * reference's Material 3 Expressive wavy progress indicator.
 *
 * Amplitude never becomes React state. It lives in one shared value
 * on the UI thread, and every bar derives its own height from it,
 * so a live conversation redraws twenty times a second without a
 * single component re-render.
 */
export function LevelMeter({ amplitude, testID }: LevelMeterProps): React.JSX.Element {
  const theme = useTheme();
  const level = useSharedValue(0);

  useEffect(() => {
    if (typeof amplitude === 'number') {
      level.value = withTiming(clamp(amplitude), { duration: 90 });
      return undefined;
    }
    const timer = setInterval(() => {
      level.value = withTiming(clamp(amplitude()), { duration: SAMPLE_PERIOD_MS });
    }, SAMPLE_PERIOD_MS);
    return () => {
      clearInterval(timer);
      level.value = withTiming(0, { duration: 90 });
    };
  }, [amplitude, level]);

  return (
    <View style={styles.row} testID={testID}>
      {Array.from({ length: BAR_COUNT }, (_, index) => (
        <LevelMeterBar
          key={index}
          level={level}
          phase={index / BAR_COUNT}
          color={theme.colors.primary}
        />
      ))}
    </View>
  );
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

interface LevelMeterBarProps {
  readonly level: SharedValue<number>;
  readonly phase: number;
  readonly color: string;
}

function LevelMeterBar({ level, phase, color }: LevelMeterBarProps): React.JSX.Element {
  const wave = 0.6 + 0.4 * Math.sin(phase * Math.PI * 2);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: Math.max(MIN_SCALE, level.value * wave) }],
  }));
  return (
    <View style={styles.barTrack}>
      <Animated.View
        style={[styles.bar, animatedStyle, { backgroundColor: color }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 32,
    width: '100%',
  },
  barTrack: {
    flex: 1,
    height: 32,
    marginHorizontal: 2,
    justifyContent: 'center',
  },
  bar: {
    height: 32,
    borderRadius: 3,
  },
});
