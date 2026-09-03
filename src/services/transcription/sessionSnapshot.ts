import { ViewStatus } from '../../app/viewStatus';
import { RealtimeSessionState } from '../../realtime/sessionState';

export interface TranscriptionSessionSnapshot {
  readonly status: ViewStatus;
  readonly sessionState: RealtimeSessionState;
  readonly elapsedMs: number;
  readonly transcript: string;
  readonly microphoneActive: boolean;
  readonly muted: boolean;
  readonly errorMessage: string | null;
  readonly canOpenSystemSettings: boolean;
  readonly protocolEvents: readonly string[];
  readonly revealProtocolPanel: boolean;
}

export const initialTranscriptionSessionSnapshot: TranscriptionSessionSnapshot = {
  status: ViewStatus.Initial,
  sessionState: RealtimeSessionState.Idle,
  elapsedMs: 0,
  transcript: '',
  microphoneActive: false,
  muted: false,
  errorMessage: null,
  canOpenSystemSettings: false,
  protocolEvents: [],
  revealProtocolPanel: false,
};

export function transcriptionSnapshotsEqual(
  a: TranscriptionSessionSnapshot,
  b: TranscriptionSessionSnapshot,
): boolean {
  return (
    a.status === b.status &&
    a.sessionState === b.sessionState &&
    a.elapsedMs === b.elapsedMs &&
    a.transcript === b.transcript &&
    a.microphoneActive === b.microphoneActive &&
    a.muted === b.muted &&
    a.errorMessage === b.errorMessage &&
    a.canOpenSystemSettings === b.canOpenSystemSettings &&
    a.protocolEvents === b.protocolEvents &&
    a.revealProtocolPanel === b.revealProtocolPanel
  );
}
