import {
  PcmAudioRecorder,
  PcmAudioRecorderHandler,
  PcmCaptureProfile,
} from '../capture';

export class FakePcmAudioRecorder implements PcmAudioRecorder {
  private handler: PcmAudioRecorderHandler | null = null;

  startCalls = 0;
  stopCalls = 0;
  disposeCalls = 0;
  isRecording = false;
  isMuted = false;
  mutedSourceBuffers = 0;
  readonly queueHighWaterMarkInChunks = 0;

  async start(
    _profile: PcmCaptureProfile,
    handler: PcmAudioRecorderHandler,
  ): Promise<void> {
    this.startCalls += 1;
    this.isRecording = true;
    this.handler = handler;
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  async stop(): Promise<void> {
    if (!this.isRecording) {
      return;
    }
    this.isRecording = false;
    this.stopCalls += 1;
    this.handler = null;
  }

  async dispose(): Promise<void> {
    this.disposeCalls += 1;
    await this.stop();
  }

  emit(chunk: Uint8Array): void {
    if (this.isRecording && !this.isMuted) {
      this.handler?.onChunk(chunk);
    }
  }

  emitError(error: unknown): void {
    const handler = this.handler;
    this.handler = null;
    this.isRecording = false;
    handler?.onError(error);
  }

  emitDone(): void {
    this.isRecording = false;
    this.handler?.onDone();
  }
}
