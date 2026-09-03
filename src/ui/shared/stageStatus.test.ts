import { RealtimeSessionState } from '../../realtime/sessionState';
import { isEnding, isFailed, isLive, showsConnecting } from './stageStatus';

describe('conversation stageStatus', () => {
  it('groups the pre-stream states as connecting', () => {
    expect(showsConnecting(RealtimeSessionState.RequestingPermission)).toBe(true);
    expect(showsConnecting(RealtimeSessionState.WaitingForStream)).toBe(true);
    expect(showsConnecting(RealtimeSessionState.Streaming)).toBe(false);
    expect(showsConnecting(RealtimeSessionState.Idle)).toBe(false);
  });

  it('recognizes the live and ending states', () => {
    expect(isLive(RealtimeSessionState.Streaming)).toBe(true);
    expect(isLive(RealtimeSessionState.Stopping)).toBe(false);
    expect(isEnding(RealtimeSessionState.Stopping)).toBe(true);
    expect(isEnding(RealtimeSessionState.Streaming)).toBe(false);
  });

  it('recognizes failure', () => {
    expect(isFailed(RealtimeSessionState.Failure)).toBe(true);
    expect(isFailed(RealtimeSessionState.Completed)).toBe(false);
  });
});
