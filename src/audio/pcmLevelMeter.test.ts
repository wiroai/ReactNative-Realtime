import { pcmNormalizedLevel } from './pcmLevelMeter';

function toneChunk(amplitude: number, samples: number): Uint8Array {
  const bytes = new Uint8Array(samples * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < samples; index += 1) {
    view.setInt16(index * 2, Math.round(amplitude * 32_767), true);
  }
  return bytes;
}

describe('pcmNormalizedLevel', () => {
  it('is zero for silence', () => {
    expect(pcmNormalizedLevel(toneChunk(0, 480))).toBe(0);
  });

  it('is zero for an empty chunk', () => {
    expect(pcmNormalizedLevel(new Uint8Array(0))).toBe(0);
  });

  it('rises toward one as amplitude grows', () => {
    const quiet = pcmNormalizedLevel(toneChunk(0.05, 480));
    const loud = pcmNormalizedLevel(toneChunk(0.5, 480));
    expect(loud).toBeGreaterThan(quiet);
    expect(loud).toBeLessThanOrEqual(1);
  });

  it('clamps a full-scale tone to one', () => {
    expect(pcmNormalizedLevel(toneChunk(1, 480))).toBeCloseTo(1, 5);
  });
});
