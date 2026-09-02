import { WiroRealtimeProtocol } from './protocol';

describe('WiroRealtimeProtocol', () => {
  it('matches the official docs for subscription and end frames', () => {
    expect(WiroRealtimeProtocol.TASK_INFO).toBe('task_info');
    expect(WiroRealtimeProtocol.TASK_SESSION_END).toBe('task_session_end');
    expect(WiroRealtimeProtocol.TASK_STREAM_READY).toBe('task_stream_ready');
    expect(WiroRealtimeProtocol.TRANSCRIPT_USER_PREFIX).toBe(
      'TRANSCRIPT_USER:',
    );
    expect(WiroRealtimeProtocol.TRANSCRIPT_AI_PREFIX).toBe('TRANSCRIPT_AI:');
    expect(WiroRealtimeProtocol.BINARY_PREFIX_SEPARATOR).toBe('|');
  });
});
