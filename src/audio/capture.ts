export enum PcmCaptureProfile {
  Conversation = 'Conversation',
  Transcription = 'Transcription',
}

/**
 * Push-based sink for one capture session's raw PCM.
 *
 * A native capture source cannot be paused from JS, so it pushes
 * chunks as they arrive instead of returning a pull-based stream;
 * `BufferedPcmAudioRecorder` absorbs the difference in a bounded
 * queue.
 */
export interface PcmCaptureHandler {
  onChunk(chunk: Uint8Array): void;
  onError(error: unknown): void;
  onDone(): void;
}

export interface PcmCaptureSource {
  readonly isRecording: boolean;
  start(profile: PcmCaptureProfile, handler: PcmCaptureHandler): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
}

export interface PcmAudioRecorderHandler {
  onChunk(chunk: Uint8Array): void;
  onError(error: unknown): void;
  onDone(): void;
}

export interface PcmAudioRecorder {
  readonly isRecording: boolean;
  readonly isMuted: boolean;
  readonly mutedSourceBuffers: number;
  readonly queueHighWaterMarkInChunks: number;
  start(
    profile: PcmCaptureProfile,
    handler: PcmAudioRecorderHandler,
  ): Promise<void>;
  setMuted(muted: boolean): void;
  stop(): Promise<void>;
  dispose(): Promise<void>;
}
