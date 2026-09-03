import { RealtimeSessionState } from '../../realtime/sessionState';

/** Ported verbatim from `TranscriptionCopy.kt`. */
export const TranscriptionCopy = {
  DESTINATION_TITLE: 'Transcription',
  CANCEL: 'Cancel',
  STOP: 'Stop',
  MUTE: 'Mute',
  UNMUTE: 'Unmute',
  CLEAR: 'Clear',
  COPY: 'Copy',
  COPIED: 'Transcript copied',
  CONNECTING: 'Connecting…',
  CONNECTING_PERMISSION: 'Waiting for microphone access…',
  STARTING_TASK: 'Starting the task…',
  CONNECTING_STREAM: 'Almost ready…',
  FINISHING: 'Finishing…',
  FAILURE_TITLE: 'Something went wrong',
  START_CTA: 'Start transcribing',
  TRY_AGAIN: 'Try again',
  EMPTY_TITLE: 'Ready to transcribe',
  EMPTY_DETAIL: 'Speak, and your words appear here as you talk.',
  LISTENING: 'Listening…',
  MUTED_NOTE: 'Microphone muted',
} as const;

export function transcriptionConnectCaption(
  state: RealtimeSessionState,
): string | null {
  switch (state) {
    case RealtimeSessionState.RequestingPermission:
      return TranscriptionCopy.CONNECTING_PERMISSION;
    case RealtimeSessionState.PreparingAudio:
      return TranscriptionCopy.CONNECTING;
    case RealtimeSessionState.CreatingTask:
      return TranscriptionCopy.STARTING_TASK;
    case RealtimeSessionState.ConnectingSocket:
      return TranscriptionCopy.CONNECTING;
    case RealtimeSessionState.WaitingForStream:
      return TranscriptionCopy.CONNECTING_STREAM;
    case RealtimeSessionState.Stopping:
      return TranscriptionCopy.FINISHING;
    default:
      return null;
  }
}
