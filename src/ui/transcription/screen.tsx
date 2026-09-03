import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {
  Button,
  IconButton,
  ProgressBar,
  Snackbar,
  Surface,
  Text,
  useTheme,
} from 'react-native-paper';
import { canStart as sessionCanStart } from '../../realtime/sessionState';
import { TranscriptionSessionController } from '../../services/transcription/sessionController';
import {
  SystemSettingsCopy,
  presentMicrophoneSettingsAlert,
} from '../shared/microphoneSettingsAlert';
import {
  StageAppBar,
  StageConnectingState,
  StageEmptyState,
  StageLiveHeader,
  StageStartButton,
} from '../shared/stage';
import { isEnding, isFailed, isLive, showsConnecting } from '../shared/stageStatus';
import { SystemSettingsOffer } from '../shared/systemSettingsOffer';
import { useServiceSnapshot } from '../shared/useServiceSnapshot';
import { TranscriptionCopy, transcriptionConnectCaption } from './copy';

const RECORDING_WAVE_AMPLITUDE = 0.55;

export interface TranscriptionScreenProps {
  readonly controller: TranscriptionSessionController;
  readonly isVisible: boolean;
}

export function TranscriptionScreen({
  controller,
  isVisible,
}: TranscriptionScreenProps): React.JSX.Element {
  const snapshot = useServiceSnapshot(controller);
  const theme = useTheme();
  const [offer, setOffer] = useState(SystemSettingsOffer.initial());
  const [showsCopiedNotice, setShowsCopiedNotice] = useState(false);

  useEffect(() => {
    setOffer(previous => previous.apply(snapshot.canOpenSystemSettings));
  }, [snapshot.canOpenSystemSettings]);

  useEffect(() => {
    if (!offer.showsAlert) {
      return;
    }
    presentMicrophoneSettingsAlert(
      snapshot.errorMessage,
      () => void controller.openSystemSettings(),
      () => setOffer(previous => previous.dismissAlert()),
    );
  }, [offer.showsAlert, snapshot.errorMessage, controller]);

  useEffect(() => {
    if (!isVisible) {
      void controller.stop();
    }
  }, [isVisible, controller]);

  const startEnabled = sessionCanStart(snapshot.sessionState) && !showsConnecting(snapshot.sessionState);
  const canClear = snapshot.transcript.length > 0 && !isLive(snapshot.sessionState) && !isEnding(snapshot.sessionState);

  const onCopy = (): void => {
    Clipboard.setString(snapshot.transcript);
    setShowsCopiedNotice(true);
  };

  return (
    <View
      style={[styles.fill, { backgroundColor: theme.colors.background }]}
      testID={isVisible ? 'transcription-visible' : 'transcription-hidden'}
    >
      <StageAppBar title={TranscriptionCopy.DESTINATION_TITLE}>
        {snapshot.transcript.length > 0 ? (
          <Button testID="copy-transcript" onPress={onCopy}>
            {TranscriptionCopy.COPY}
          </Button>
        ) : null}
        {canClear ? (
          <Button onPress={() => controller.clearTranscript()}>
            {TranscriptionCopy.CLEAR}
          </Button>
        ) : null}
        {snapshot.canOpenSystemSettings ? (
          <Button
            testID="open-settings-control"
            onPress={() => void controller.openSystemSettings()}
          >
            {SystemSettingsCopy.OPEN}
          </Button>
        ) : null}
      </StageAppBar>
      {showsConnecting(snapshot.sessionState) ? <ProgressBar indeterminate /> : null}
      <View style={styles.content}>
        <TranscriptionStage
          snapshot={snapshot}
          startEnabled={startEnabled}
          onStart={() => void controller.start()}
          onStop={() => void controller.stop()}
          onSetMuted={muted => controller.setMuted(muted)}
        />
      </View>
      <Snackbar
        visible={showsCopiedNotice}
        onDismiss={() => setShowsCopiedNotice(false)}
        duration={2000}
      >
        {TranscriptionCopy.COPIED}
      </Snackbar>
    </View>
  );
}

interface TranscriptionStageProps {
  readonly snapshot: TranscriptionSessionController['snapshot'];
  readonly startEnabled: boolean;
  readonly onStart: () => void;
  readonly onStop: () => void;
  readonly onSetMuted: (muted: boolean) => void;
}

function TranscriptionStage({
  snapshot,
  startEnabled,
  onStart,
  onStop,
  onSetMuted,
}: TranscriptionStageProps): React.JSX.Element {
  if (showsConnecting(snapshot.sessionState)) {
    return (
      <StageConnectingState
        caption={transcriptionConnectCaption(snapshot.sessionState) ?? TranscriptionCopy.CONNECTING}
      >
        <Button testID="cancel-transcription" onPress={onStop} style={styles.trailingButton}>
          {TranscriptionCopy.CANCEL}
        </Button>
      </StageConnectingState>
    );
  }

  if (isLive(snapshot.sessionState) || isEnding(snapshot.sessionState)) {
    return (
      <TranscriptionLiveStage snapshot={snapshot} onStop={onStop} onSetMuted={onSetMuted} />
    );
  }

  if (isFailed(snapshot.sessionState) && snapshot.errorMessage && snapshot.transcript.length === 0) {
    return (
      <StageEmptyState
        icon="alert-circle-outline"
        headline={TranscriptionCopy.FAILURE_TITLE}
        supportingText={snapshot.errorMessage}
        tone="error"
      >
        <StageStartButton
          label={TranscriptionCopy.TRY_AGAIN}
          testID="start-transcription"
          enabled={startEnabled}
          onPress={onStart}
        />
      </StageEmptyState>
    );
  }

  if (snapshot.transcript.length > 0) {
    return (
      <View style={styles.fill}>
        <TranscriptBody snapshot={snapshot} style={styles.fill} />
        <Button
          testID="start-transcription"
          mode="contained"
          icon="microphone"
          disabled={!startEnabled}
          onPress={onStart}
          style={styles.fullWidthButton}
        >
          {TranscriptionCopy.START_CTA}
        </Button>
      </View>
    );
  }

  return (
    <StageEmptyState
      icon="microphone-outline"
      headline={TranscriptionCopy.EMPTY_TITLE}
      supportingText={TranscriptionCopy.EMPTY_DETAIL}
    >
      <StageStartButton
        label={TranscriptionCopy.START_CTA}
        testID="start-transcription"
        enabled={startEnabled}
        onPress={onStart}
      />
    </StageEmptyState>
  );
}

interface TranscriptionLiveStageProps {
  readonly snapshot: TranscriptionSessionController['snapshot'];
  readonly onStop: () => void;
  readonly onSetMuted: (muted: boolean) => void;
}

function TranscriptionLiveStage({
  snapshot,
  onStop,
  onSetMuted,
}: TranscriptionLiveStageProps): React.JSX.Element {
  const amplitude = isLive(snapshot.sessionState) && !snapshot.muted ? RECORDING_WAVE_AMPLITUDE : 0;
  const caption = isEnding(snapshot.sessionState)
    ? TranscriptionCopy.FINISHING
    : snapshot.muted
      ? TranscriptionCopy.MUTED_NOTE
      : TranscriptionCopy.LISTENING;
  return (
    <View style={styles.fill}>
      <StageLiveHeader
        caption={caption}
        elapsedMs={snapshot.elapsedMs}
        amplitude={amplitude}
        waveTestID="recording-wave"
      />
      <TranscriptBody
        snapshot={snapshot}
        style={[styles.fill, styles.transcriptWithToolbar]}
        followsTail
      />
      <Surface style={styles.toolbar} elevation={2}>
        <IconButton
          testID="mute-transcription"
          icon={snapshot.muted ? 'microphone-off' : 'microphone'}
          mode={snapshot.muted ? 'contained' : undefined}
          accessibilityLabel={snapshot.muted ? TranscriptionCopy.UNMUTE : TranscriptionCopy.MUTE}
          onPress={() => onSetMuted(!snapshot.muted)}
        />
        <IconButton
          testID="stop-transcription"
          icon="stop"
          mode="contained"
          disabled={isEnding(snapshot.sessionState)}
          accessibilityLabel={TranscriptionCopy.STOP}
          onPress={onStop}
        />
      </Surface>
    </View>
  );
}

interface TranscriptBodyProps {
  readonly snapshot: TranscriptionSessionController['snapshot'];
  readonly style?: React.ComponentProps<typeof ScrollView>['style'];
  /** Keep the newest words in view as a live transcript grows. */
  readonly followsTail?: boolean;
}

function TranscriptBody({
  snapshot,
  style,
  followsTail = false,
}: TranscriptBodyProps): React.JSX.Element {
  const theme = useTheme();
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  return (
    <ScrollView
      ref={scrollRef}
      style={style}
      contentContainerStyle={styles.transcriptContent}
      onContentSizeChange={
        followsTail ? () => scrollRef.current?.scrollToEnd({ animated: true }) : undefined
      }
    >
      {isFailed(snapshot.sessionState) && snapshot.errorMessage ? (
        <Text variant="bodyLarge" style={[styles.errorText, { color: theme.colors.error }]}>
          {snapshot.errorMessage}
        </Text>
      ) : null}
      {snapshot.transcript.length > 0 ? (
        <Surface
          style={[styles.transcriptCard, { backgroundColor: theme.colors.surface }]}
          elevation={0}
        >
          <Text variant="bodyLarge" testID="transcript-text">
            {snapshot.transcript}
          </Text>
        </Surface>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24, paddingVertical: 16 },
  trailingButton: { marginTop: 12 },
  fullWidthButton: { marginTop: 12 },
  transcriptContent: { paddingBottom: 8 },
  transcriptWithToolbar: { marginTop: 16, marginBottom: 88 },
  transcriptCard: { width: '100%', padding: 16, borderRadius: 20 },
  errorText: { marginBottom: 16 },
  toolbar: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    flexDirection: 'row',
    borderRadius: 28,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});
