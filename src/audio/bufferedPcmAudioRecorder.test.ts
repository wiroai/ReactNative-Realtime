import { waitUntil } from '../realtime/support/waitUntil';
import { AudioConstants } from './audioConstants';
import { AudioFailure } from './audioFailure';
import { BufferedPcmAudioRecorder } from './bufferedPcmAudioRecorder';
import { PcmCaptureProfile } from './capture';
import { FakePcmCaptureSource } from './support/fakePcmCaptureSource';

describe('BufferedPcmAudioRecorder', () => {
  it('emits fixed twenty millisecond chunks in FIFO order', async () => {
    const source = new FakePcmCaptureSource();
    const recorder = new BufferedPcmAudioRecorder(source);
    const received: Uint8Array[] = [];
    await recorder.start(PcmCaptureProfile.Transcription, {
      onChunk: chunk => received.push(chunk),
      onError: () => {},
      onDone: () => {},
    });

    const bytes = new Uint8Array(AudioConstants.PCM_BYTES_PER_CHUNK * 2 + 80);
    bytes.forEach((_, index) => {
      bytes[index] = index % 255;
    });
    source.emit(bytes);
    await waitUntil(() => received.length === 2);

    expect(received).toHaveLength(2);
    expect(
      received.every(chunk => chunk.length === AudioConstants.PCM_BYTES_PER_CHUNK),
    ).toBe(true);
    await recorder.dispose();
  });

  it('mutes drop captured and queued microphone audio', async () => {
    const source = new FakePcmCaptureSource();
    const recorder = new BufferedPcmAudioRecorder(source);
    const received: Uint8Array[] = [];
    await recorder.start(PcmCaptureProfile.Conversation, {
      onChunk: chunk => received.push(chunk),
      onError: () => {},
      onDone: () => {},
    });

    recorder.setMuted(true);
    source.emit(new Uint8Array(AudioConstants.PCM_BYTES_PER_CHUNK * 2));
    await waitUntil(() => recorder.mutedSourceBuffers >= 1);
    recorder.setMuted(false);
    source.emit(new Uint8Array(AudioConstants.PCM_BYTES_PER_CHUNK).fill(7));
    await waitUntil(() => received.length === 1);

    expect(received).toHaveLength(1);
    expect(received[0].every(byte => byte === 7)).toBe(true);
    await recorder.dispose();
  });

  it('maps raw capture errors to a sanitized failure', async () => {
    const source = new FakePcmCaptureSource();
    const recorder = new BufferedPcmAudioRecorder(source);
    let error: unknown = null;
    await recorder.start(PcmCaptureProfile.Transcription, {
      onChunk: () => {},
      onError: thrown => {
        error = thrown;
      },
      onDone: () => {},
    });

    source.emitError(new Error('private platform detail'));
    await waitUntil(() => error !== null);

    expect(error).toBe(AudioFailure.Capture);
    expect(String(error)).not.toContain('platform');
    await recorder.dispose();
  });

  it('releases the source across repeated start, stop, and dispose', async () => {
    const source = new FakePcmCaptureSource();
    const recorder = new BufferedPcmAudioRecorder(source);

    await recorder.start(PcmCaptureProfile.Transcription, {
      onChunk: () => {},
      onError: () => {},
      onDone: () => {},
    });
    await recorder.stop();
    await recorder.start(PcmCaptureProfile.Conversation, {
      onChunk: () => {},
      onError: () => {},
      onDone: () => {},
    });
    await recorder.stop();
    await recorder.dispose();
    await recorder.dispose();

    expect(source.startCalls).toBe(2);
    expect(source.stopCalls).toBe(2);
    expect(source.disposeCalls).toBe(1);
  });
});
