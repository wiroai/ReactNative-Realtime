import { AudioConstants } from './audioConstants';
import { AudioFailure } from './audioFailure';
import { BoundedPcmQueue } from './boundedPcmQueue';
import {
  PcmAudioRecorder,
  PcmAudioRecorderHandler,
  PcmCaptureProfile,
  PcmCaptureSource,
} from './capture';
import { PcmChunker } from './pcmChunker';

/**
 * Chunks a capture source into 20 ms PCM frames behind a bounded
 * queue.
 *
 * Two generations are tracked for two different kinds of
 * staleness. `captureGeneration` bumps on every start, mute, and
 * stop, and guards a chunk mid-flight through the queue from being
 * credited to a session that already moved on. `captureSession`
 * bumps only on start, and tells a late error or completion event
 * from a source registration this recorder has already replaced
 * apart from a real event on the one that is still active.
 */
export class BufferedPcmAudioRecorder implements PcmAudioRecorder {
  private readonly source: PcmCaptureSource;
  private readonly queueCapacityInChunks: number;

  private queue: BoundedPcmQueue | null = null;
  private chunker: PcmChunker | null = null;
  private handler: PcmAudioRecorderHandler | null = null;
  private pumpPromise: Promise<void> | null = null;
  private captureFailure: AudioFailure | null = null;
  private recording = false;
  private muted = false;
  private disposed = false;
  private captureGeneration = 0;
  private captureSession = 0;
  private mutedBuffers = 0;
  private highWater = 0;

  constructor(
    source: PcmCaptureSource,
    queueCapacityInChunks: number = AudioConstants.DEFAULT_QUEUE_CAPACITY_IN_CHUNKS,
  ) {
    this.source = source;
    this.queueCapacityInChunks = queueCapacityInChunks;
  }

  get isRecording(): boolean {
    return this.recording;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get mutedSourceBuffers(): number {
    return this.mutedBuffers;
  }

  get queueHighWaterMarkInChunks(): number {
    return this.queue?.highWaterMarkInChunks ?? this.highWater;
  }

  async start(
    profile: PcmCaptureProfile,
    handler: PcmAudioRecorderHandler,
  ): Promise<void> {
    if (this.disposed) {
      throw AudioFailure.Capture;
    }
    if (this.recording) {
      this.handler = handler;
      return;
    }
    const queue = new BoundedPcmQueue(this.queueCapacityInChunks);
    const chunker = new PcmChunker(AudioConstants.PCM_BYTES_PER_CHUNK);
    this.queue = queue;
    this.chunker = chunker;
    this.captureFailure = null;
    this.handler = handler;
    this.captureGeneration += 1;
    this.captureSession += 1;
    const session = this.captureSession;

    try {
      await this.source.start(profile, {
        onChunk: bytes => this.handleSourceData(bytes),
        onError: error => this.handleSourceError(error, session),
        onDone: () => this.handleSourceDone(session),
      });
    } catch {
      queue.close();
      this.queue = null;
      this.chunker = null;
      throw AudioFailure.Capture;
    }
    this.recording = true;
    this.pumpPromise = this.pumpQueue(queue, handler);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.captureGeneration += 1;
      this.queue?.clear();
      this.chunker?.reset();
    }
  }

  async stop(): Promise<void> {
    this.recording = false;
    this.captureGeneration += 1;
    this.queue?.clear();
    this.queue?.close();
    this.chunker?.reset();
    await this.pumpPromise;
    this.pumpPromise = null;
    this.queue = null;
    this.chunker = null;
    await this.source.stop();
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    await this.stop();
    await this.source.dispose();
  }

  private isCurrent(generation: number): boolean {
    return this.recording && !this.muted && generation === this.captureGeneration;
  }

  private handleSourceData(bytes: Uint8Array): void {
    if (!this.recording) {
      return;
    }
    if (this.muted) {
      this.mutedBuffers += 1;
      return;
    }
    const queue = this.queue;
    const chunker = this.chunker;
    if (!queue || !chunker) {
      return;
    }
    const generation = this.captureGeneration;
    chunker.add(bytes).forEach(chunk => {
      if (!this.isCurrent(generation)) {
        return;
      }
      void queue.add(chunk).then(() => {
        const mark = queue.highWaterMarkInChunks;
        if (mark > this.highWater) {
          this.highWater = mark;
        }
        if (!this.isCurrent(generation)) {
          queue.clear();
        }
      });
    });
  }

  private handleSourceError(error: unknown, session: number): void {
    if (session !== this.captureSession) {
      return;
    }
    this.captureFailure = AudioFailure.Capture;
    this.recording = false;
    this.queue?.close();
    void this.source.stop();
    this.handler?.onError(AudioFailure.Capture);
  }

  private handleSourceDone(session: number): void {
    if (session !== this.captureSession) {
      return;
    }
    this.recording = false;
    this.queue?.close();
  }

  private async pumpQueue(
    queue: BoundedPcmQueue,
    handler: PcmAudioRecorderHandler,
  ): Promise<void> {
    while (true) {
      const chunk = await queue.take();
      if (chunk === null) {
        break;
      }
      handler.onChunk(chunk);
    }
    this.recording = false;
    if (!this.captureFailure) {
      handler.onDone();
    }
  }
}
