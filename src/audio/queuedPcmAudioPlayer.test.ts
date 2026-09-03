import { waitUntil } from '../realtime/support/waitUntil';
import { AudioFailure, AudioFailureCode } from './audioFailure';
import { PcmPlaybackProfile } from './playback';
import { QueuedPcmAudioPlayer } from './queuedPcmAudioPlayer';
import { FakePcmPlaybackSink } from './support/fakePcmPlaybackSink';

describe('QueuedPcmAudioPlayer', () => {
  it('exposes stable audio failure codes', () => {
    expect(AudioFailure.Playback.code).toBe(AudioFailureCode.PlaybackUnavailable);
    expect(AudioFailure.Capture.code).toBe(AudioFailureCode.CaptureUnavailable);
  });

  it('initializes the sink with the given profile on start', async () => {
    const sink = new FakePcmPlaybackSink();
    const player = new QueuedPcmAudioPlayer(sink, {
      profile: PcmPlaybackProfile.Media,
    });

    await player.start();

    expect(sink.lastProfile).toBe(PcmPlaybackProfile.Media);
    await player.dispose();
  });

  it('feeds queued chunks to the sink in FIFO order', async () => {
    const sink = new FakePcmPlaybackSink();
    const player = new QueuedPcmAudioPlayer(sink);

    await player.start();
    await player.enqueue(Uint8Array.from([1]));
    await player.enqueue(Uint8Array.from([2]));
    await player.complete();

    expect(sink.fedChunks).toHaveLength(2);
    expect(sink.fedChunks[0]).toEqual(Uint8Array.from([1]));
    expect(sink.fedChunks[1]).toEqual(Uint8Array.from([2]));
    expect(sink.endOfStreamCalls).toBe(1);
    expect(player.isPlaying).toBe(false);
    await player.dispose();
  });

  it('waits out a long tail while the sink keeps consuming', async () => {
    const sink = new FakePcmPlaybackSink({ feedDelayMs: 30 });
    const player = new QueuedPcmAudioPlayer(sink, { drainTimeoutMs: 60 });

    await player.start();
    for (let index = 0; index < 10; index += 1) {
      await player.enqueue(Uint8Array.from([index]));
    }
    await player.complete();

    expect(sink.fedChunks).toHaveLength(10);
    expect(sink.endOfStreamCalls).toBe(1);
    expect(player.isPlaying).toBe(false);
    await player.dispose();
  }, 10_000);

  it('lets completion finish even against a stalled sink', async () => {
    const sink = new FakePcmPlaybackSink({ stalled: true });
    const player = new QueuedPcmAudioPlayer(sink, { drainTimeoutMs: 40 });

    await player.start();
    await player.enqueue(Uint8Array.from([1]));
    await player.complete();

    expect(player.isPlaying).toBe(false);
    expect(sink.fedChunks).toHaveLength(0);
    await player.dispose();
  });

  it('flushes on disable and accepts PCM again once re-enabled', async () => {
    const sink = new FakePcmPlaybackSink();
    const player = new QueuedPcmAudioPlayer(sink);

    await player.start();
    await player.setEnabled(false);
    await player.enqueue(Uint8Array.from([1, 2]));
    await player.setEnabled(true);
    await player.enqueue(Uint8Array.from([3, 4]));
    await player.complete();

    expect(sink.fedChunks).toHaveLength(1);
    expect(sink.fedChunks[0]).toEqual(Uint8Array.from([3, 4]));
    expect(sink.volumes).toEqual([1.0, 0.0, 1.0]);
    expect(sink.stopCalls).toBe(1);
    expect(player.isEnabled).toBe(true);
    await player.dispose();
  });

  it('reports sanitized playback failures', async () => {
    const sink = new FakePcmPlaybackSink({ failFeed: true });
    const player = new QueuedPcmAudioPlayer(sink);
    let failure: AudioFailure | null = null;
    player.addFailureListener(seen => {
      failure = seen;
    });

    await player.start();
    await player.enqueue(Uint8Array.from([1]));
    await waitUntil(() => failure !== null);

    expect(failure).toBe(AudioFailure.Playback);
    expect(String(failure)).not.toContain('platform');
    await player.dispose();
  });

  it('reinitializes the sink on every start and disposes once', async () => {
    const sink = new FakePcmPlaybackSink();
    const player = new QueuedPcmAudioPlayer(sink);

    await player.start();
    await player.stop();
    await player.start();
    await player.complete();
    await player.dispose();
    await player.dispose();

    expect(sink.initializeCalls).toBe(2);
    expect(sink.playCalls).toBe(2);
    expect(sink.disposeCalls).toBe(1);
  });
});
