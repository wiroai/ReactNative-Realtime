export enum RealtimeSessionState {
  Idle = 'Idle',
  RequestingPermission = 'RequestingPermission',
  PreparingAudio = 'PreparingAudio',
  CreatingTask = 'CreatingTask',
  ConnectingSocket = 'ConnectingSocket',
  WaitingForStream = 'WaitingForStream',
  Streaming = 'Streaming',
  Stopping = 'Stopping',
  Completed = 'Completed',
  Failure = 'Failure',
}

const IDLE_LIKE_STATES: ReadonlySet<RealtimeSessionState> = new Set([
  RealtimeSessionState.Idle,
  RealtimeSessionState.Completed,
  RealtimeSessionState.Failure,
]);

export function isIdleLike(state: RealtimeSessionState): boolean {
  return IDLE_LIKE_STATES.has(state);
}

export function isActive(state: RealtimeSessionState): boolean {
  return !isIdleLike(state);
}

export function canStart(state: RealtimeSessionState): boolean {
  return isIdleLike(state);
}

export function canStop(state: RealtimeSessionState): boolean {
  return isActive(state);
}
