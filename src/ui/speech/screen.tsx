import React, { useEffect, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { Button, ProgressBar, Text, TextInput, useTheme } from 'react-native-paper';
import { canStart as sessionCanStart } from '../../realtime/sessionState';
import { SpeechSessionController } from '../../services/speech/sessionController';
import { LevelMeter } from '../shared/levelMeter';
import { StageAppBar } from '../shared/stage';
import { isEnding, isLive, showsConnecting } from '../shared/stageStatus';
import { useServiceSnapshot } from '../shared/useServiceSnapshot';
import { SpeechCopy, speechConnectCaption } from './copy';
import { formatElapsed } from '../shared/elapsedFormat';

const SPEAKING_WAVE_AMPLITUDE = 0.55;

export interface SpeechScreenProps {
  readonly controller: SpeechSessionController;
  readonly isVisible: boolean;
}

export function SpeechScreen({ controller, isVisible }: SpeechScreenProps): React.JSX.Element {
  const snapshot = useServiceSnapshot(controller);
  const theme = useTheme();
  const [prompt, setPrompt] = useState(controller.prompt);

  const onPromptChange = (text: string): void => {
    setPrompt(text);
    controller.prompt = text;
  };

  useEffect(() => {
    if (!isVisible) {
      void controller.stop();
    }
  }, [isVisible, controller]);

  const showsConnectingBar = showsConnecting(snapshot.sessionState);
  const stops = showsConnectingBar || isLive(snapshot.sessionState) || isEnding(snapshot.sessionState);
  const playEnabled =
    sessionCanStart(snapshot.sessionState) && !showsConnectingBar && prompt.trim().length > 0;
  const note = stageNote(snapshot, stops);
  const amplitude = snapshot.isPlaying ? SPEAKING_WAVE_AMPLITUDE : 0;

  return (
    <View
      style={[styles.fill, { backgroundColor: theme.colors.background }]}
      testID={isVisible ? 'speech-visible' : 'speech-hidden'}
    >
      {/* Everything but the field and the controls ends editing: the
          app bar, the margins, and the stage under the prompt. */}
      <Pressable
        style={styles.fill}
        onPress={Keyboard.dismiss}
        accessible={false}
        testID="speech-stage"
      >
        <StageAppBar title={SpeechCopy.DESTINATION_TITLE} />
        {showsConnectingBar ? <ProgressBar indeterminate /> : null}
        <View style={styles.content}>
          {note ? <SpeechLiveStatus caption={note} snapshot={snapshot} amplitude={amplitude} /> : null}
          {snapshot.errorMessage ? (
            <Text variant="bodyMedium" style={[styles.errorText, { color: theme.colors.error }]}>
              {snapshot.errorMessage}
            </Text>
          ) : null}
          <TextInput
            testID="tts-prompt"
            mode="outlined"
            label={SpeechCopy.PROMPT_HINT}
            value={prompt}
            onChangeText={onPromptChange}
            disabled={stops}
            multiline
            style={styles.promptField}
          />
          {prompt.length > 0 ? (
            <Text
              testID="tts-character-count"
              variant="bodySmall"
              style={[styles.characterCount, { color: theme.colors.onSurfaceVariant }]}
            >
              {SpeechCopy.characterCount(prompt.length)}
            </Text>
          ) : null}
          <View style={styles.stageSpacer} />
          <SpeechPrimaryAction
            stops={stops}
            isConnecting={showsConnectingBar}
            ending={isEnding(snapshot.sessionState)}
            playEnabled={playEnabled}
            onPlay={() => void controller.start()}
            onStop={() => void controller.stop()}
          />
        </View>
      </Pressable>
    </View>
  );
}

interface SpeechLiveStatusProps {
  readonly caption: string;
  readonly snapshot: SpeechSessionController['snapshot'];
  readonly amplitude: number;
}

function SpeechLiveStatus({ caption, snapshot, amplitude }: SpeechLiveStatusProps): React.JSX.Element {
  const theme = useTheme();
  const showsElapsed = isLive(snapshot.sessionState) || isEnding(snapshot.sessionState);
  return (
    <View style={styles.liveStatus}>
      <View style={styles.liveStatusRow}>
        <Text variant="titleSmall">{caption}</Text>
        <View style={styles.liveStatusSpacer} />
        {showsElapsed ? (
          <Text
            variant="bodySmall"
            style={[styles.elapsed, { color: theme.colors.onSurfaceVariant }]}
          >
            {formatElapsed(snapshot.elapsedMs)}
          </Text>
        ) : null}
      </View>
      <View style={styles.liveStatusMeter}>
        <LevelMeter amplitude={amplitude} testID="speaking-wave" />
      </View>
    </View>
  );
}

function stageNote(
  snapshot: SpeechSessionController['snapshot'],
  stops: boolean,
): string | null {
  if (!stops) {
    return null;
  }
  return speechConnectCaption(snapshot.sessionState, snapshot.isPlaying);
}

interface SpeechPrimaryActionProps {
  readonly stops: boolean;
  readonly isConnecting: boolean;
  readonly ending: boolean;
  readonly playEnabled: boolean;
  readonly onPlay: () => void;
  readonly onStop: () => void;
}

/**
 * Play is the point of the screen, so it is a full-width button
 * under the prompt rather than a toolbar icon — see
 * `SpeechPrimaryAction` in `TextToSpeechScreen.kt`.
 */
function SpeechPrimaryAction({
  stops,
  isConnecting,
  ending,
  playEnabled,
  onPlay,
  onStop,
}: SpeechPrimaryActionProps): React.JSX.Element {
  const theme = useTheme();
  if (stops) {
    return (
      <Button
        testID="stop-speech"
        mode="contained"
        icon="stop"
        disabled={ending}
        onPress={onStop}
        buttonColor={theme.colors.errorContainer}
        textColor={theme.colors.onErrorContainer}
        style={styles.primaryAction}
      >
        {isConnecting ? SpeechCopy.CANCEL : SpeechCopy.STOP}
      </Button>
    );
  }
  return (
    <Button
      testID="play-speech"
      mode="contained"
      icon="play"
      disabled={!playEnabled}
      onPress={onPlay}
      style={styles.primaryAction}
    >
      {SpeechCopy.PLAY}
    </Button>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flex: 1, padding: 16 },
  // The field grows with the text instead of filling the stage, so
  // there is somewhere to tap that is not the field.
  promptField: { minHeight: 140, maxHeight: '50%' },
  stageSpacer: { flex: 1, minHeight: 16 },
  characterCount: { alignSelf: 'flex-end', marginTop: 8 },
  primaryAction: { marginTop: 16, height: 52, justifyContent: 'center' },
  errorText: { marginBottom: 8 },
  liveStatus: { marginBottom: 12 },
  liveStatusRow: { flexDirection: 'row', alignItems: 'center' },
  liveStatusSpacer: { flex: 1 },
  liveStatusMeter: { marginTop: 12 },
  elapsed: { fontVariant: ['tabular-nums'] },
});
