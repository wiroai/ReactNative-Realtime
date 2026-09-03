import { PcmPlaybackProfile, PcmPlaybackSink } from '../playback';

export interface FakePcmPlaybackSinkOptions {
  readonly failFeed?: boolean;
  readonly stalled?: boolean;
  readonly feedDelayMs?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(() => resolve(), ms));
}

export class FakePcmPlaybackSink implements PcmPlaybackSink {
  private readonly failFeed: boolean;
  private readonly stalled: boolean;
  private readonly feedDelayMs: number;
  private readonly fed: Uint8Array[] = [];
  private readonly recordedVolumes: number[] = [];

  initializeCalls = 0;
  lastProfile: PcmPlaybackProfile | null = null;
  playCalls = 0;
  endOfStreamCalls = 0;
  stopCalls = 0;
  flushCalls = 0;
  disposeCalls = 0;

  constructor(options: FakePcmPlaybackSinkOptions = {}) {
    this.failFeed = options.failFeed ?? false;
    this.stalled = options.stalled ?? false;
    this.feedDelayMs = options.feedDelayMs ?? 0;
  }

  get fedChunks(): Uint8Array[] {
    return this.fed.slice();
  }

  get volumes(): number[] {
    return this.recordedVolumes.slice();
  }

  onUnderrun(): void {
    // No underruns are simulated by this fake.
  }

  async initialize(profile: PcmPlaybackProfile): Promise<void> {
    this.initializeCalls += 1;
    this.lastProfile = profile;
  }

  async play(): Promise<void> {
    this.playCalls += 1;
  }

  async feed(chunk: Uint8Array): Promise<void> {
    if (this.failFeed) {
      throw new Error('private platform failure');
    }
    if (this.feedDelayMs > 0) {
      await delay(this.feedDelayMs);
    }
    this.fed.push(chunk.slice());
  }

  async flush(): Promise<void> {
    this.flushCalls += 1;
    this.fed.length = 0;
  }

  async bufferedDurationMs(): Promise<number> {
    return this.stalled ? 30_000 : 0;
  }

  async setVolume(volume: number): Promise<void> {
    this.recordedVolumes.push(volume);
  }

  async endOfStream(): Promise<void> {
    this.endOfStreamCalls += 1;
  }

  async stop(): Promise<void> {
    this.stopCalls += 1;
  }

  async dispose(): Promise<void> {
    this.disposeCalls += 1;
  }
}
