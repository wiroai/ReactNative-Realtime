import { RealtimeSessionState } from '../../realtime/sessionState';

/** Ported verbatim from `SpeechCopy.kt`. */
export const SpeechCopy = {
  DESTINATION_TITLE: 'Speech',
  PROMPT_HINT: 'Type or paste the text to speak',
  CONNECTING: 'Connecting…',
  PREPARING_AUDIO: 'Preparing audio…',
  STARTING_TASK: 'Starting the task…',
  CONNECTING_STREAM: 'Almost ready…',
  BUFFERING: 'Buffering…',
  SPEAKING: 'Speaking…',
  FINISHING: 'Finishing…',
  PLAY: 'Play',
  STOP: 'Stop',
  CANCEL: 'Cancel',
  characterCount(count: number): string {
    return `${count} characters`;
  },
} as const;

export function speechConnectCaption(
  state: RealtimeSessionState,
  isPlaying: boolean,
): string | null {
  switch (state) {
    case RealtimeSessionState.PreparingAudio:
      return SpeechCopy.PREPARING_AUDIO;
    case RealtimeSessionState.CreatingTask:
      return SpeechCopy.STARTING_TASK;
    case RealtimeSessionState.ConnectingSocket:
      return SpeechCopy.CONNECTING;
    case RealtimeSessionState.WaitingForStream:
      return SpeechCopy.CONNECTING_STREAM;
    case RealtimeSessionState.Streaming:
      return isPlaying ? SpeechCopy.SPEAKING : SpeechCopy.BUFFERING;
    case RealtimeSessionState.Stopping:
      return SpeechCopy.FINISHING;
    default:
      return null;
  }
}
