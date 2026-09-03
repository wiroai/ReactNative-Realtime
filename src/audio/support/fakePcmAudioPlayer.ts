import { AudioFailure } from '../audioFailure';
import { PcmAudioPlayer } from '../playback';

export interface FakePcmAudioPlayerOptions {
  readonly holdComplete?: boolean;
}

/**
 * A `PcmAudioPlayer` double that records what it was fed instead of
 * touching a native sink — used to drive service-level tests
 * without the real `QueuedPcmAudioPlayer` queueing behavior.
 */
export class FakePcmAudioPlayer implements PcmAudioPlayer {
  private readonly holdComplete: boolean;
  private readonly fed: Uint8Array[] = [];
  private readonly failureListeners: Array<(failure: AudioFailure) => void> =
    [];
  private completeRelease: (() => void) | null = null;
  private completeReleased = false;

  startCalls = 0;
  completeCalls = 0;
  stopCalls = 0;
  flushCalls = 0;
  disposeCalls = 0;
  playing = false;
  enabled = true;

  readonly droppedChunks = 0;
  readonly queueHighWaterMarkInChunks = 0;
  readonly maximumFeedLatencyMicros = 0;
  readonly underrunCount = 0;

  constructor(options: FakePcmAudioPlayerOptions = {}) {
    this.holdComplete = options.holdComplete ?? false;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  get fedChunks(): Uint8Array[] {
    return this.fed.slice();
  }

  addFailureListener(listener: (failure: AudioFailure) => void): void {
    this.failureListeners.push(listener);
  }

  async start(): Promise<void> {
    this.startCalls += 1;
    this.playing = true;
  }

  tryEnqueue(chunk: Uint8Array): boolean {
    if (!this.playing || !this.enabled) {
      return false;
    }
    this.fed.push(chunk.slice());
    return true;
  }

  async enqueue(chunk: Uint8Array): Promise<void> {
    this.tryEnqueue(chunk);
  }

  flush(): void {
    this.flushCalls += 1;
    this.fed.length = 0;
  }

  async complete(): Promise<void> {
    this.completeCalls += 1;
    if (this.holdComplete && !this.completeReleased) {
      await new Promise<void>(resolve => {
        this.completeRelease = resolve;
      });
    }
    this.playing = false;
  }

  releaseComplete(): void {
    this.completeReleased = true;
    const release = this.completeRelease;
    this.completeRelease = null;
    release?.();
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled;
  }

  async stop(): Promise<void> {
    if (!this.playing) {
      return;
    }
    this.stopCalls += 1;
    this.playing = false;
    this.completeRelease?.();
    this.completeRelease = null;
  }

  async dispose(): Promise<void> {
    this.disposeCalls += 1;
    this.playing = false;
  }

  emitFailure(): void {
    this.failureListeners.forEach(listener => listener(AudioFailure.Playback));
  }
}
