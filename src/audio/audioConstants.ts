/**
 * PCM wire format from Wiro realtime docs, verified 2026-08-31.
 *
 * Samples are signed 16-bit little-endian on both directions of the
 * stream; changing the rate means changing it in the Run request and
 * in the local pipeline together, or the audio is garbled.
 */
export const AudioConstants = {
  SAMPLE_RATE_HZ: 24_000,
  CHANNEL_COUNT: 1,
  BITS_PER_SAMPLE: 16,
  CHUNK_DURATION_MS: 20,
  SAMPLES_PER_CHUNK: 480,
  PCM_BYTES_PER_CHUNK: 960,
  BYTES_PER_SAMPLE: 2,
  PREFERRED_IO_BUFFER_SECONDS: 0.02,
  DEFAULT_QUEUE_CAPACITY_IN_CHUNKS: 50,
} as const;

/**
 * How much written PCM is still sitting in the sink, in
 * milliseconds.
 *
 * Written minus the playback head, never a running total of every
 * byte ever fed. A growing total made `QueuedPcmAudioPlayer` wait
 * forever after two seconds of speech, so the assistant said a few
 * words and went silent.
 */
export function pcmBufferedDurationMs(
  writtenFrames: number,
  playbackHeadFrames: number,
  sampleRateHz: number = AudioConstants.SAMPLE_RATE_HZ,
): number {
  const pending = Math.max(0, writtenFrames - playbackHeadFrames);
  if (pending <= 0 || sampleRateHz <= 0) {
    return 0;
  }
  return (pending / sampleRateHz) * 1000;
}
