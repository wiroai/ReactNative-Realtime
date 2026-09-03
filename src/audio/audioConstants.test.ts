import { AudioConstants, pcmBufferedDurationMs } from './audioConstants';

describe('AudioConstants', () => {
  it('matches the documented PCM wire frame', () => {
    expect(AudioConstants.SAMPLE_RATE_HZ).toBe(24_000);
    expect(AudioConstants.SAMPLES_PER_CHUNK).toBe(480);
    expect(AudioConstants.PCM_BYTES_PER_CHUNK).toBe(960);
    expect(AudioConstants.BYTES_PER_SAMPLE).toBe(2);
  });
});

describe('pcmBufferedDurationMs', () => {
  it('is unplayed frames, not a running total', () => {
    expect(pcmBufferedDurationMs(72_000, 24_000)).toBe(2_000);
  });

  it('is zero once the playback head catches up', () => {
    expect(pcmBufferedDurationMs(24_000, 24_000)).toBe(0);
  });

  it('never goes negative when the head overtakes the write count', () => {
    expect(pcmBufferedDurationMs(1_000, 2_000)).toBe(0);
  });
});
