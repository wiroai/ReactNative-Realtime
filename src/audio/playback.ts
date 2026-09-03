/**
 * Voice-communication playback keeps the echo canceller in the loop
 * and follows the call route (earpiece unless rerouted). Media
 * playback is plain listening and comes out of the loudspeaker by
 * default.
 */
export enum PcmPlaybackProfile {
  Conversation = 'Conversation',
  Media = 'Media',
}

export interface PcmPlaybackSink {
  onUnderrun(listener: () => void): void;
  initialize(profile: PcmPlaybackProfile): Promise<void>;
  play(): Promise<void>;
  feed(chunk: Uint8Array): Promise<void>;
  flush(): Promise<void>;
  bufferedDurationMs(): Promise<number>;
  setVolume(volume: number): Promise<void>;
  endOfStream(): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
}

export interface PcmAudioPlayer {
  readonly isPlaying: boolean;
  readonly isEnabled: boolean;
  readonly droppedChunks: number;
  readonly queueHighWaterMarkInChunks: number;
  readonly maximumFeedLatencyMicros: number;
  readonly underrunCount: number;
  addFailureListener(listener: (failure: unknown) => void): void;
  start(): Promise<void>;
  tryEnqueue(chunk: Uint8Array): boolean;
  enqueue(chunk: Uint8Array): Promise<void>;
  flush(): void;
  complete(): Promise<void>;
  setEnabled(enabled: boolean): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
}
