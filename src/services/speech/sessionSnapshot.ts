import { ViewStatus } from '../../app/viewStatus';
import { ModelDefinition } from '../../models/modelDefinition';
import { RealtimeSessionState } from '../../realtime/sessionState';

export interface SpeechSessionSnapshot {
  readonly selectedModel: ModelDefinition;
  readonly status: ViewStatus;
  readonly sessionState: RealtimeSessionState;
  readonly elapsedMs: number;
  readonly isPlaying: boolean;
  readonly errorMessage: string | null;
  readonly protocolEvents: readonly string[];
  readonly revealProtocolPanel: boolean;
}

export function initialSpeechSessionSnapshot(
  selectedModel: ModelDefinition,
): SpeechSessionSnapshot {
  return {
    selectedModel,
    status: ViewStatus.Initial,
    sessionState: RealtimeSessionState.Idle,
    elapsedMs: 0,
    isPlaying: false,
    errorMessage: null,
    protocolEvents: [],
    revealProtocolPanel: false,
  };
}

export function speechSnapshotsEqual(
  a: SpeechSessionSnapshot,
  b: SpeechSessionSnapshot,
): boolean {
  return (
    a.selectedModel === b.selectedModel &&
    a.status === b.status &&
    a.sessionState === b.sessionState &&
    a.elapsedMs === b.elapsedMs &&
    a.isPlaying === b.isPlaying &&
    a.errorMessage === b.errorMessage &&
    a.protocolEvents === b.protocolEvents &&
    a.revealProtocolPanel === b.revealProtocolPanel
  );
}
