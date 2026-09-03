import { PcmNoiseGate } from './pcmNoiseGate';

// The gate measures level from RMS, so a constant-value chunk (no
// oscillation) has RMS equal to its own amplitude — a convenient
// way to target a specific `pcmNormalizedLevel` reading in tests.
function toneChunk(amplitude: number, samples = 480): Uint8Array {
  const bytes = new Uint8Array(samples * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < samples; index += 1) {
    view.setInt16(index * 2, Math.round(amplitude * 32_767), true);
  }
  return bytes;
}

function firstSample(chunk: Uint8Array): number {
  return new DataView(chunk.buffer, chunk.byteOffset).getInt16(0, true);
}

describe('PcmNoiseGate', () => {
  it('passes a loud chunk through unchanged', () => {
    const gate = new PcmNoiseGate();
    const loud = toneChunk(0.6);

    const output = gate.process(loud);

    expect(output).toBe(loud);
    expect(gate.lastOutputLevel).toBeGreaterThan(0);
  });

  it('attenuates a chunk quieter than the open threshold', () => {
    const gate = new PcmNoiseGate();
    const quiet = toneChunk(0.02);

    const output = gate.process(quiet);

    expect(output).not.toBe(quiet);
    expect(Math.abs(firstSample(output))).toBeLessThan(
      Math.abs(firstSample(quiet)),
    );
  });

  it('keeps passing chunks through during its hangover window', () => {
    let now = 0;
    const gate = new PcmNoiseGate({ hangoverMs: 100, nowMillis: () => now });
    gate.process(toneChunk(0.6));
    expect(gate.isOpen).toBe(true);

    now = 50;
    const output = gate.process(toneChunk(0.02));

    expect(output).not.toEqual(new Uint8Array(output.length));
    expect(gate.isOpen).toBe(true);
  });

  it('closes once the hangover window elapses', () => {
    let now = 0;
    const gate = new PcmNoiseGate({ hangoverMs: 100, nowMillis: () => now });
    gate.process(toneChunk(0.6));

    now = 200;
    gate.process(toneChunk(0.02));

    expect(gate.isOpen).toBe(false);
  });

  it('requires a louder signal to open while the assistant is audible', () => {
    const gate = new PcmNoiseGate({
      minOpenLevel: 0.2,
      assistantOpenLevel: 0.5,
    });
    const midLevel = toneChunk(0.05);

    const withoutAssistant = gate.process(midLevel);
    gate.reset();
    const withAssistant = gate.process(midLevel, true);

    expect(withoutAssistant).toBe(midLevel);
    expect(withAssistant).not.toBe(midLevel);
  });

  it('resets ambient floor and open state', () => {
    const gate = new PcmNoiseGate();
    gate.process(toneChunk(0.6));

    gate.reset();

    expect(gate.ambientFloor).toBe(0);
    expect(gate.isOpen).toBe(false);
    expect(gate.lastOutputLevel).toBe(0);
  });
});
