import { formatElapsed } from './elapsedFormat';

describe('formatElapsed', () => {
  it('pads seconds under a minute', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(7_000)).toBe('0:07');
  });

  it('carries minutes', () => {
    expect(formatElapsed(67_000)).toBe('1:07');
    expect(formatElapsed(600_000)).toBe('10:00');
  });

  it('truncates partial seconds', () => {
    expect(formatElapsed(1_999)).toBe('0:01');
  });
});
