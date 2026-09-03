import { RealtimeSessionState } from '../../realtime/sessionState';

/** Ported verbatim from `ConversationCopy.kt`. */
export const ConversationCopy = {
  DESTINATION_TITLE: 'Conversation',
  CANCEL: 'Cancel',
  STOP: 'Stop',
  MUTE: 'Mute',
  UNMUTE: 'Unmute',
  INTERRUPT: 'Silence assistant',
  CONNECTING: 'Connecting…',
  CONNECTING_PERMISSION: 'Waiting for microphone access…',
  STARTING_TASK: 'Starting the task…',
  CONNECTING_STREAM: 'Almost ready…',
  START_CTA: 'Start conversation',
  TRY_AGAIN: 'Try again',
  EMPTY_TITLE: 'Talk it out',
  EMPTY_DETAIL:
    'A live voice conversation with the assistant,\nright from this screen.',
  FAILURE_TITLE: 'Something went wrong',
  LISTENING: 'Listening…',
  HEARING_YOU: 'Hearing you…',
  ASSISTANT_SPEAKING: 'Assistant speaking…',
  MUTED_NOTE: 'Microphone muted',
  ENDING: 'Finishing…',
  YOU: 'You',
  ASSISTANT: 'Assistant',
} as const;

/**
 * The wait between the tap and the first audible word, named.
 *
 * Permission can hang on a system dialog and a cold task can take
 * seconds, so a single "Connecting…" leaves no way to tell a
 * session that is coming from one that is stuck.
 */
export function conversationConnectCaption(
  state: RealtimeSessionState,
): string | null {
  switch (state) {
    case RealtimeSessionState.RequestingPermission:
      return ConversationCopy.CONNECTING_PERMISSION;
    case RealtimeSessionState.PreparingAudio:
      return ConversationCopy.CONNECTING;
    case RealtimeSessionState.CreatingTask:
      return ConversationCopy.STARTING_TASK;
    case RealtimeSessionState.ConnectingSocket:
      return ConversationCopy.CONNECTING;
    case RealtimeSessionState.WaitingForStream:
      return ConversationCopy.CONNECTING_STREAM;
    default:
      return null;
  }
}
