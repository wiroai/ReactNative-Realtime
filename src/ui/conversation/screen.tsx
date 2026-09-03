import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  IconButton,
  ProgressBar,
  Surface,
  Text,
  useTheme,
} from 'react-native-paper';
import { canStart as sessionCanStart } from '../../realtime/sessionState';
import { ConversationSessionController } from '../../services/conversation/sessionController';
import { ConversationVoicePhase } from '../../services/conversation/voiceActivity';
import {
  SystemSettingsCopy,
  presentMicrophoneSettingsAlert,
} from '../shared/microphoneSettingsAlert';
import { AmplitudeSource } from '../shared/levelMeter';
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
import { ConversationCopy, conversationConnectCaption } from './copy';

export interface ConversationScreenProps {
  readonly controller: ConversationSessionController;
  readonly isVisible: boolean;
}

export function ConversationScreen({
  controller,
  isVisible,
}: ConversationScreenProps): React.JSX.Element {
  const snapshot = useServiceSnapshot(controller);
  const theme = useTheme();
  const [offer, setOffer] = useState(SystemSettingsOffer.initial());

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
    if (isVisible) {
      void controller.resume();
    } else {
      void controller.suspend();
    }
  }, [isVisible, controller]);

  // The phase is discrete and changes a few times per sentence, so
  // it is subscribed like any other service state. Levels are
  // continuous and stay out of React entirely: the meter polls
  // this sampler straight into a UI-thread shared value.
  const voicePhase = useSyncExternalStore(
    listener => controller.voiceActivity.subscribePhase(listener),
    () => controller.voiceActivity.phase,
  );
  const muted = snapshot.muted;
  const sampleAmplitude = useCallback(() => {
    if (muted) {
      return 0;
    }
    const activity = controller.voiceActivity;
    return Math.max(activity.userLevel, activity.aiLevel);
  }, [controller, muted]);

  const startEnabled = sessionCanStart(snapshot.sessionState) && !showsConnecting(snapshot.sessionState);
  const hasTranscripts = snapshot.userTranscript.length > 0 || snapshot.aiTranscript.length > 0;

  return (
    <View
      style={[styles.fill, { backgroundColor: theme.colors.background }]}
      testID={isVisible ? 'conversation-visible' : 'conversation-hidden'}
    >
      <StageAppBar title={ConversationCopy.DESTINATION_TITLE}>
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
        <ConversationStage
          snapshot={snapshot}
          startEnabled={startEnabled}
          hasTranscripts={hasTranscripts}
          voicePhase={voicePhase}
          amplitude={sampleAmplitude}
          onStart={() => void controller.start()}
          onStop={() => void controller.stop()}
          onSetMuted={next => controller.setMuted(next)}
          onInterrupt={() => controller.interruptAssistant()}
        />
      </View>
    </View>
  );
}

interface ConversationStageProps {
  readonly snapshot: ConversationSessionController['snapshot'];
  readonly startEnabled: boolean;
  readonly hasTranscripts: boolean;
  readonly voicePhase: ConversationVoicePhase;
  readonly amplitude: AmplitudeSource;
  readonly onStart: () => void;
  readonly onStop: () => void;
  readonly onSetMuted: (muted: boolean) => void;
  readonly onInterrupt: () => void;
}

function ConversationStage({
  snapshot,
  startEnabled,
  hasTranscripts,
  voicePhase,
  amplitude,
  onStart,
  onStop,
  onSetMuted,
  onInterrupt,
}: ConversationStageProps): React.JSX.Element {
  if (showsConnecting(snapshot.sessionState)) {
    return (
      <StageConnectingState
        caption={conversationConnectCaption(snapshot.sessionState) ?? ConversationCopy.CONNECTING}
      >
        <Button testID="cancel-conversation" onPress={onStop} style={styles.trailingButton}>
          {ConversationCopy.CANCEL}
        </Button>
      </StageConnectingState>
    );
  }

  if (isLive(snapshot.sessionState) || isEnding(snapshot.sessionState)) {
    return (
      <ConversationLiveStage
        snapshot={snapshot}
        voicePhase={voicePhase}
        amplitude={amplitude}
        onStop={onStop}
        onSetMuted={onSetMuted}
        onInterrupt={onInterrupt}
      />
    );
  }

  if (isFailed(snapshot.sessionState) && snapshot.errorMessage && !hasTranscripts) {
    return (
      <StageEmptyState
        icon="alert-circle-outline"
        headline={ConversationCopy.FAILURE_TITLE}
        supportingText={snapshot.errorMessage}
        tone="error"
      >
        <StageStartButton
          label={ConversationCopy.TRY_AGAIN}
          testID="start-conversation"
          enabled={startEnabled}
          onPress={onStart}
        />
      </StageEmptyState>
    );
  }

  if (hasTranscripts) {
    return (
      <View style={styles.fill}>
        <ConversationTranscripts snapshot={snapshot} style={styles.fill} />
        <Button
          testID="start-conversation"
          mode="contained"
          icon="microphone"
          disabled={!startEnabled}
          onPress={onStart}
          style={styles.fullWidthButton}
        >
          {ConversationCopy.START_CTA}
        </Button>
      </View>
    );
  }

  return (
    <StageEmptyState
      icon="forum-outline"
      headline={ConversationCopy.EMPTY_TITLE}
      supportingText={ConversationCopy.EMPTY_DETAIL}
    >
      <StageStartButton
        label={ConversationCopy.START_CTA}
        testID="start-conversation"
        enabled={startEnabled}
        onPress={onStart}
      />
    </StageEmptyState>
  );
}

interface ConversationLiveStageProps {
  readonly snapshot: ConversationSessionController['snapshot'];
  readonly voicePhase: ConversationVoicePhase;
  readonly amplitude: AmplitudeSource;
  readonly onStop: () => void;
  readonly onSetMuted: (muted: boolean) => void;
  readonly onInterrupt: () => void;
}

function ConversationLiveStage({
  snapshot,
  voicePhase,
  amplitude,
  onStop,
  onSetMuted,
  onInterrupt,
}: ConversationLiveStageProps): React.JSX.Element {
  return (
    <View style={styles.fill}>
      <StageLiveHeader
        caption={liveCaption(snapshot, voicePhase)}
        elapsedMs={snapshot.elapsedMs}
        amplitude={amplitude}
        waveTestID="voice-level"
      />
      <ConversationTranscripts
        snapshot={snapshot}
        style={[styles.fill, styles.transcriptsWithToolbar]}
        followsTail
      />
      <ConversationLiveToolbar
        muted={snapshot.muted}
        ending={isEnding(snapshot.sessionState)}
        onStop={onStop}
        onSetMuted={onSetMuted}
        onInterrupt={onInterrupt}
      />
    </View>
  );
}

interface ConversationLiveToolbarProps {
  readonly muted: boolean;
  readonly ending: boolean;
  readonly onStop: () => void;
  readonly onSetMuted: (muted: boolean) => void;
  readonly onInterrupt: () => void;
}

function ConversationLiveToolbar({
  muted,
  ending,
  onStop,
  onSetMuted,
  onInterrupt,
}: ConversationLiveToolbarProps): React.JSX.Element {
  const theme = useTheme();
  return (
    <Surface style={[styles.toolbar, { backgroundColor: theme.colors.elevation.level3 }]} elevation={0}>
      <IconButton
        testID="mute-conversation"
        icon={muted ? 'microphone-off' : 'microphone'}
        mode={muted ? 'contained' : undefined}
        accessibilityLabel={muted ? ConversationCopy.UNMUTE : ConversationCopy.MUTE}
        onPress={() => onSetMuted(!muted)}
      />
      <IconButton
        testID="interrupt-conversation"
        icon="volume-off"
        accessibilityLabel={ConversationCopy.INTERRUPT}
        onPress={onInterrupt}
      />
      <IconButton
        testID="stop-conversation"
        icon="stop"
        mode="contained"
        containerColor={theme.colors.error}
        iconColor={theme.colors.onError}
        disabled={ending}
        accessibilityLabel={ConversationCopy.STOP}
        onPress={onStop}
      />
    </Surface>
  );
}

function liveCaption(
  snapshot: ConversationSessionController['snapshot'],
  phase: ConversationVoicePhase,
): string {
  if (isEnding(snapshot.sessionState)) {
    return ConversationCopy.ENDING;
  }
  if (snapshot.muted) {
    return ConversationCopy.MUTED_NOTE;
  }
  if (phase === ConversationVoicePhase.UserSpeaking) {
    return ConversationCopy.HEARING_YOU;
  }
  if (phase === ConversationVoicePhase.AiSpeaking) {
    return ConversationCopy.ASSISTANT_SPEAKING;
  }
  return ConversationCopy.LISTENING;
}

interface ConversationTranscriptsProps {
  readonly snapshot: ConversationSessionController['snapshot'];
  readonly style?: React.ComponentProps<typeof ScrollView>['style'];
  /** Keep the newest words in view as a live transcript grows. */
  readonly followsTail?: boolean;
}

function ConversationTranscripts({
  snapshot,
  style,
  followsTail = false,
}: ConversationTranscriptsProps): React.JSX.Element {
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
      {snapshot.userTranscript.length > 0 ? (
        <TranscriptBubble label={ConversationCopy.YOU} text={snapshot.userTranscript} alignEnd />
      ) : null}
      {snapshot.aiTranscript.length > 0 ? (
        <TranscriptBubble label={ConversationCopy.ASSISTANT} text={snapshot.aiTranscript} alignEnd={false} />
      ) : null}
    </ScrollView>
  );
}

interface TranscriptBubbleProps {
  readonly label: string;
  readonly text: string;
  readonly alignEnd: boolean;
}

function TranscriptBubble({ label, text, alignEnd }: TranscriptBubbleProps): React.JSX.Element {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.bubbleRow,
        alignEnd ? styles.bubbleRowEnd : styles.bubbleRowStart,
      ]}
    >
      <Text
        variant="labelSmall"
        style={[styles.bubbleLabel, { color: theme.colors.onSurfaceVariant }]}
      >
        {label}
      </Text>
      <Surface
        style={[
          styles.bubble,
          alignEnd ? styles.bubbleEnd : styles.bubbleStart,
          {
            backgroundColor: alignEnd
              ? theme.colors.primaryContainer
              : theme.colors.elevation.level2,
          },
        ]}
        elevation={0}
      >
        <Text variant="bodyLarge">{text}</Text>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24, paddingVertical: 16 },
  trailingButton: { marginTop: 12 },
  fullWidthButton: { marginTop: 12 },
  transcriptContent: { paddingBottom: 8 },
  transcriptsWithToolbar: { marginTop: 16, marginBottom: 88 },
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
  bubbleRow: { width: '100%', marginBottom: 12 },
  bubbleRowEnd: { alignItems: 'flex-end' },
  bubbleRowStart: { alignItems: 'flex-start' },
  bubbleLabel: { marginBottom: 4 },
  bubble: { maxWidth: '88%', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20 },
  bubbleEnd: { borderBottomRightRadius: 6 },
  bubbleStart: { borderBottomLeftRadius: 6 },
});
