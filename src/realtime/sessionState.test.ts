import { RealtimeSessionState, canStart, canStop } from './sessionState';

describe('RealtimeSessionState', () => {
  it('lets idle-like states start and active states stop', () => {
    expect(canStart(RealtimeSessionState.Idle)).toBe(true);
    expect(canStart(RealtimeSessionState.Completed)).toBe(true);
    expect(canStart(RealtimeSessionState.Failure)).toBe(true);
    expect(canStart(RealtimeSessionState.Streaming)).toBe(false);
    expect(canStop(RealtimeSessionState.Streaming)).toBe(true);
    expect(canStop(RealtimeSessionState.Idle)).toBe(false);
  });
});
