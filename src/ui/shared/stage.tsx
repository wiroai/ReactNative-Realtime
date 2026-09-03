import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Appbar, Button, Icon, Text, useTheme } from 'react-native-paper';
import { formatElapsed } from './elapsedFormat';
import { AmplitudeSource, LevelMeter } from './levelMeter';

export interface StageAppBarProps {
  readonly title: string;
  /** Trailing app-bar actions. */
  readonly children?: React.ReactNode;
}

/**
 * The top of every destination. wiro.ai draws its header in the
 * page color rather than on a raised card, so the bar takes
 * `background` instead of Paper's default `surface` — otherwise a
 * white strip sits over a cream page with a seam between them.
 */
export function StageAppBar({ title, children }: StageAppBarProps): React.JSX.Element {
  const theme = useTheme();
  return (
    <Appbar.Header elevated={false} style={{ backgroundColor: theme.colors.background }}>
      <Appbar.Content title={title} />
      {children}
    </Appbar.Header>
  );
}

/** Which Material color roles the empty state's icon badge takes. */
export type StageTone = 'primary' | 'error';

export interface StageEmptyStateProps {
  readonly icon: string;
  readonly headline: string;
  readonly supportingText?: string | null;
  readonly tone?: StageTone;
  readonly children?: React.ReactNode;
}

/**
 * The empty / error stage: an icon on a tonal container, a
 * headline, and one line of support, centered where the content
 * will be. Ported from `StageEmptyState` in `StageState.kt`.
 */
export function StageEmptyState({
  icon,
  headline,
  supportingText,
  tone = 'primary',
  children,
}: StageEmptyStateProps): React.JSX.Element {
  const theme = useTheme();
  const badge =
    tone === 'error'
      ? {
          container: theme.colors.errorContainer,
          icon: theme.colors.onErrorContainer,
        }
      : {
          container: theme.colors.primaryContainer,
          icon: theme.colors.primary,
        };
  return (
    <View style={styles.centeredFill}>
      <View style={[styles.iconBadge, { backgroundColor: badge.container }]}>
        <Icon source={icon} size={40} color={badge.icon} />
      </View>
      <Text
        variant="headlineSmall"
        style={styles.headline}
        accessibilityRole="header"
      >
        {headline}
      </Text>
      {supportingText ? (
        <Text
          variant="bodyMedium"
          style={[styles.supporting, { color: theme.colors.onSurfaceVariant }]}
        >
          {supportingText}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

export interface StageConnectingStateProps {
  readonly caption: string;
  readonly children?: React.ReactNode;
}

/** The wait after a tap: a spinner and the named step. */
export function StageConnectingState({
  caption,
  children,
}: StageConnectingStateProps): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={styles.centeredFill}>
      <ActivityIndicator size={40} />
      <Text
        variant="bodyLarge"
        style={[styles.connectingCaption, { color: theme.colors.onSurfaceVariant }]}
      >
        {caption}
      </Text>
      {children}
    </View>
  );
}

export interface StageStartButtonProps {
  readonly label: string;
  readonly enabled: boolean;
  readonly onPress: () => void;
  readonly testID?: string;
}

/** The stage's one primary action: a microphone and a promise. */
export function StageStartButton({
  label,
  enabled,
  onPress,
  testID,
}: StageStartButtonProps): React.JSX.Element {
  return (
    <View style={styles.startButtonRow}>
      <Button
        mode="contained"
        icon="microphone"
        disabled={!enabled}
        onPress={onPress}
        testID={testID}
      >
        {label}
      </Button>
    </View>
  );
}

export interface StageLiveHeaderProps {
  readonly caption: string;
  readonly elapsedMs: number;
  readonly amplitude: AmplitudeSource;
  readonly waveTestID?: string;
}

/**
 * The display clock is the largest text on screen; past this
 * multiplier it no longer fits above the meter on a phone.
 */
const CLOCK_MAX_FONT_SCALE = 1.5;

/**
 * The head of a live stage: what is happening, for how long, and
 * the animated level meter. Ported from `StageLiveHeader`.
 */
export function StageLiveHeader({
  caption,
  elapsedMs,
  amplitude,
  waveTestID,
}: StageLiveHeaderProps): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={styles.liveHeader}>
      <Text
        variant="titleMedium"
        style={[styles.liveCaption, { color: theme.colors.onSurfaceVariant }]}
      >
        {caption}
      </Text>
      <Text
        variant="displayMedium"
        style={styles.liveClock}
        maxFontSizeMultiplier={CLOCK_MAX_FONT_SCALE}
      >
        {formatElapsed(elapsedMs)}
      </Text>
      <View style={styles.liveMeter}>
        <LevelMeter amplitude={amplitude} testID={waveTestID} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centeredFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    marginTop: 24,
    textAlign: 'center',
  },
  supporting: {
    marginTop: 8,
    textAlign: 'center',
  },
  connectingCaption: {
    marginTop: 20,
    textAlign: 'center',
  },
  startButtonRow: {
    marginTop: 28,
  },
  liveHeader: {
    alignItems: 'center',
    width: '100%',
  },
  liveCaption: {
    marginTop: 8,
    textAlign: 'center',
  },
  liveClock: {
    marginTop: 4,
    textAlign: 'center',
    // Equal-width digits keep the clock from jittering every second.
    fontVariant: ['tabular-nums'],
  },
  liveMeter: {
    width: '100%',
    marginTop: 24,
    marginBottom: 8,
  },
});
