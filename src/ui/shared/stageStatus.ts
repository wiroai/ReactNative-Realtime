import { RealtimeSessionState } from '../../realtime/sessionState';

const CONNECTING_STATES: ReadonlySet<RealtimeSessionState> = new Set([
  RealtimeSessionState.RequestingPermission,
  RealtimeSessionState.PreparingAudio,
  RealtimeSessionState.CreatingTask,
  RealtimeSessionState.ConnectingSocket,
  RealtimeSessionState.WaitingForStream,
]);

export function showsConnecting(state: RealtimeSessionState): boolean {
  return CONNECTING_STATES.has(state);
}

export function isLive(state: RealtimeSessionState): boolean {
  return state === RealtimeSessionState.Streaming;
}

export function isEnding(state: RealtimeSessionState): boolean {
  return state === RealtimeSessionState.Stopping;
}

export function isFailed(state: RealtimeSessionState): boolean {
  return state === RealtimeSessionState.Failure;
}
