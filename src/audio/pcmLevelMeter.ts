import { AudioConstants } from './audioConstants';

/**
 * Perceptual loudness of one 16-bit little-endian PCM chunk, in
 * `[0, 1]`.
 *
 * RMS is mapped through a power curve so normal speech spans most
 * of the range instead of huddling near zero. Every consumer of
 * microphone or assistant levels must read this same scale.
 */
export function pcmNormalizedLevel(chunk: Uint8Array): number {
  const sampleCount = Math.floor(chunk.length / AudioConstants.BYTES_PER_SAMPLE);
  if (sampleCount <= 0) {
    return 0;
  }
  const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  let sumOfSquares = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = view.getInt16(index * 2, true) / 32_768;
    sumOfSquares += sample * sample;
  }
  const rms = Math.sqrt(sumOfSquares / sampleCount);
  return Math.min(1, Math.pow(rms * 5, 0.8));
}
