import { WiroEndpoints } from './endpoints';

describe('WiroEndpoints', () => {
  it('matches the official Wiro docs for REST and socket hosts', () => {
    expect(WiroEndpoints.REST_BASE).toBe('https://api.wiro.ai/v1');
    expect(WiroEndpoints.SOCKET_URL).toBe('wss://socket.wiro.ai/v1');
    expect(WiroEndpoints.runPath('openai', 'gpt-realtime-mini')).toBe(
      '/Run/openai/gpt-realtime-mini',
    );
    expect(WiroEndpoints.TASK_CANCEL).toBe('/Task/Cancel');
    expect(WiroEndpoints.TASK_KILL).toBe('/Task/Kill');
  });
});
