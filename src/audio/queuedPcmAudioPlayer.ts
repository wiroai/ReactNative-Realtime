import { raceTimeout } from '../realtime/raceTimeout';
import { AudioConstants } from './audioConstants';
import { AudioFailure } from './audioFailure';
import { BoundedPcmQueue } from './boundedPcmQueue';
import { PcmAudioPlayer, PcmPlaybackProfile, PcmPlaybackSink } from './playback';

export interface QueuedPcmAudioPlayerOptions {
  readonly profile?: PcmPlaybackProfile;
  readonly queueCapacityInChunks?: number;
  readonly maxNativeBufferDurationMs?: number;
  readonly backpressurePollIntervalMs?: number;
  readonly drainTimeoutMs?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(() => resolve(), ms));
}

/**
 * Plays PCM through a sink, with a bounded queue in front.
 *
 * `complete` waits out the queued tail for as long as the sink
 * keeps consuming. A sink that stopped draining — a torn-down
 * engine, a task the server just ended — must not hold the caller
 * forever.
 */
export class QueuedPcmAudioPlayer implements PcmAudioPlayer {
  private readonly sink: PcmPlaybackSink;
  private readonly profile: PcmPlaybackProfile;
  private readonly queueCapacityInChunks: number;
  private readonly maxNativeBufferDurationMs: number;
  private readonly backpressurePollIntervalMs: number;
  private readonly drainTimeoutMs: number;
  private readonly failureListeners: Array<(failure: AudioFailure) => void> =
    [];

  private queue: BoundedPcmQueue | null = null;
  private consumePromise: Promise<void> | null = null;
  private playing = false;
  private enabled = true;
  private initialized = false;
  private disposed = false;
  private playbackGeneration = 0;
  private dropped = 0;
  private maxFeedLatency = 0;
  private highWater = 0;
  private underrunsSeen = 0;
  private consumedChunks = 0;
  private consumeFinished = false;

  constructor(sink: PcmPlaybackSink, options: QueuedPcmAudioPlayerOptions = {}) {
    this.sink = sink;
    this.profile = options.profile ?? PcmPlaybackProfile.Conversation;
    this.queueCapacityInChunks =
      options.queueCapacityInChunks ??
      AudioConstants.DEFAULT_QUEUE_CAPACITY_IN_CHUNKS;
    this.maxNativeBufferDurationMs = options.maxNativeBufferDurationMs ?? 2_000;
    this.backpressurePollIntervalMs = options.backpressurePollIntervalMs ?? 10;
    this.drainTimeoutMs = options.drainTimeoutMs ?? 5_000;
    this.sink.onUnderrun(() => {
      this.underrunsSeen += 1;
    });
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  get droppedChunks(): number {
    return this.dropped;
  }

  get queueHighWaterMarkInChunks(): number {
    return this.queue?.highWaterMarkInChunks ?? this.highWater;
  }

  get maximumFeedLatencyMicros(): number {
    return this.maxFeedLatency;
  }

  get underrunCount(): number {
    return this.underrunsSeen;
  }

  addFailureListener(listener: (failure: AudioFailure) => void): void {
    this.failureListeners.push(listener);
  }

  async start(): Promise<void> {
    if (this.disposed) {
      throw AudioFailure.Playback;
    }
    if (this.playing) {
      return;
    }
    try {
      await this.sink.initialize(this.profile);
      const queue = new BoundedPcmQueue(this.queueCapacityInChunks);
      this.initialized = true;
      this.queue = queue;
      this.playing = true;
      this.consumeFinished = false;
      this.playbackGeneration += 1;
      const currentlyEnabled = this.enabled;
      await this.sink.setVolume(currentlyEnabled ? 1.0 : 0.0);
      await this.sink.play();
      this.consumePromise = this.consume(queue);
    } catch {
      this.playing = false;
      this.queue?.close();
      throw AudioFailure.Playback;
    }
  }

  tryEnqueue(chunk: Uint8Array): boolean {
    if (!this.playing || chunk.length === 0) {
      return false;
    }
    if (!this.enabled) {
      return true;
    }
    const added = this.queue?.tryAdd(chunk) ?? false;
    if (!added) {
      this.dropped += 1;
    } else {
      const mark = this.queue?.highWaterMarkInChunks ?? 0;
      if (mark > this.highWater) {
        this.highWater = mark;
      }
    }
    return added;
  }

  async enqueue(chunk: Uint8Array): Promise<void> {
    if (!this.playing || !this.enabled || chunk.length === 0) {
      return;
    }
    await this.queue?.add(chunk);
  }

  flush(): void {
    if (!this.playing) {
      return;
    }
    this.playbackGeneration += 1;
    this.queue?.clear();
    void this.flushSink();
  }

  async complete(): Promise<void> {
    if (!this.playing) {
      return;
    }
    this.queue?.close();
    const worker = this.consumePromise;
    try {
      if (worker) {
        await this.drainWhileProgressing();
      }
      if (!this.playing || this.disposed) {
        return;
      }
      if (this.enabled) {
        await raceTimeout(this.sink.endOfStream(), this.drainTimeoutMs);
      }
      this.playing = false;
      this.queue = null;
      this.consumePromise = null;
    } catch {
      this.abandonTail();
    }
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (this.enabled === enabled) {
      return;
    }
    this.enabled = enabled;
    this.playbackGeneration += 1;
    if (!enabled) {
      this.queue?.clear();
    }
    if (!this.initialized) {
      return;
    }
    try {
      if (enabled) {
        await this.sink.setVolume(1.0);
        if (this.playing) {
          await this.sink.play();
        }
      } else {
        await this.sink.setVolume(0.0);
        await this.sink.stop();
      }
    } catch {
      this.reportFailure();
    }
  }

  async stop(): Promise<void> {
    this.playing = false;
    this.playbackGeneration += 1;
    this.queue?.clear();
    this.queue?.close();
    if (this.consumePromise) {
      await this.waitUntilFinishedOrTimeout(this.drainTimeoutMs);
    }
    this.queue = null;
    this.consumePromise = null;
    if (this.initialized) {
      try {
        await this.sink.stop();
      } catch {
        this.reportFailure();
      }
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    await this.stop();
    if (this.initialized) {
      await this.sink.dispose();
    }
  }

  private async consume(queue: BoundedPcmQueue): Promise<void> {
    try {
      while (this.playing) {
        const chunk = await queue.take();
        if (chunk === null || !this.playing) {
          break;
        }
        if (!this.enabled) {
          continue;
        }
        const generation = this.playbackGeneration;
        await this.waitForNativeCapacity();
        if (!this.playing) {
          break;
        }
        if (!this.enabled || generation !== this.playbackGeneration) {
          continue;
        }
        const started = Date.now();
        await this.sink.feed(chunk);
        const micros = (Date.now() - started) * 1_000;
        this.consumedChunks += 1;
        if (micros > this.maxFeedLatency) {
          this.maxFeedLatency = micros;
        }
      }
    } catch {
      this.reportFailure();
    } finally {
      this.consumeFinished = true;
    }
  }

  private async drainWhileProgressing(): Promise<void> {
    let lastConsumed = this.consumedChunks;
    let idleMs = 0;
    while (true) {
      if (this.consumeFinished) {
        return;
      }
      await delay(10);
      idleMs += 10;
      const consumed = this.consumedChunks;
      if (consumed !== lastConsumed) {
        lastConsumed = consumed;
        idleMs = 0;
      } else if (idleMs >= this.drainTimeoutMs) {
        throw AudioFailure.Playback;
      }
    }
  }

  private async waitForNativeCapacity(): Promise<void> {
    while (this.playing) {
      const buffered = await this.sink.bufferedDurationMs();
      if (buffered < this.maxNativeBufferDurationMs) {
        return;
      }
      await delay(this.backpressurePollIntervalMs);
    }
  }

  private abandonTail(): void {
    this.playing = false;
    this.queue?.clear();
    this.queue?.close();
    this.queue = null;
    this.consumePromise = null;
    void this.stopAfterFailure();
  }

  private async flushSink(): Promise<void> {
    if (!this.initialized) {
      return;
    }
    try {
      await this.sink.flush();
    } catch {
      this.reportFailure();
    }
  }

  private reportFailure(): void {
    this.playing = false;
    this.queue?.clear();
    this.queue?.close();
    this.failureListeners.forEach(listener => listener(AudioFailure.Playback));
    void this.stopAfterFailure();
  }

  private async stopAfterFailure(): Promise<void> {
    if (!this.initialized) {
      return;
    }
    try {
      await this.sink.stop();
    } catch {
      // Already failing; nothing more to report.
    }
  }

  private async waitUntilFinishedOrTimeout(timeoutMs: number): Promise<void> {
    let elapsed = 0;
    while (elapsed < timeoutMs) {
      if (this.consumeFinished) {
        return;
      }
      await delay(10);
      elapsed += 10;
    }
    this.playing = false;
  }
}
