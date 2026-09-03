import { ViewStatus } from '../../app/viewStatus';
import { RealtimeSessionState } from '../../realtime/sessionState';

/**
 * Everything a conversation session knows about itself at one
 * moment.
 *
 * The service's whole output surface. Transcripts and the clock
 * live here because a reconnect preserves what was said and the
 * limit watches the clock. Tests read the session through this
 * alone.
 */
export interface ConversationSessionSnapshot {
  readonly status: ViewStatus;
  readonly sessionState: RealtimeSessionState;
  readonly elapsedMs: number;
  readonly userTranscript: string;
  readonly aiTranscript: string;
  readonly microphoneActive: boolean;
  readonly muted: boolean;
  readonly isReconfiguring: boolean;
  readonly isSuspended: boolean;
  readonly errorMessage: string | null;
  readonly canOpenSystemSettings: boolean;
  readonly protocolEvents: readonly string[];
}

export const initialConversationSessionSnapshot: ConversationSessionSnapshot = {
  status: ViewStatus.Initial,
  sessionState: RealtimeSessionState.Idle,
  elapsedMs: 0,
  userTranscript: '',
  aiTranscript: '',
  microphoneActive: false,
  muted: false,
  isReconfiguring: false,
  isSuspended: false,
  errorMessage: null,
  canOpenSystemSettings: false,
  protocolEvents: [],
};

export function conversationSnapshotsEqual(
  a: ConversationSessionSnapshot,
  b: ConversationSessionSnapshot,
): boolean {
  return (
    a.status === b.status &&
    a.sessionState === b.sessionState &&
    a.elapsedMs === b.elapsedMs &&
    a.userTranscript === b.userTranscript &&
    a.aiTranscript === b.aiTranscript &&
    a.microphoneActive === b.microphoneActive &&
    a.muted === b.muted &&
    a.isReconfiguring === b.isReconfiguring &&
    a.isSuspended === b.isSuspended &&
    a.errorMessage === b.errorMessage &&
    a.canOpenSystemSettings === b.canOpenSystemSettings &&
    a.protocolEvents === b.protocolEvents
  );
}
