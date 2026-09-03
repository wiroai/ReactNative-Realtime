import { PcmCaptureHandler, PcmCaptureProfile, PcmCaptureSource } from '../capture';

export class FakePcmCaptureSource implements PcmCaptureSource {
  private handler: PcmCaptureHandler | null = null;

  startCalls = 0;
  stopCalls = 0;
  disposeCalls = 0;
  isRecording = false;

  async start(
    _profile: PcmCaptureProfile,
    handler: PcmCaptureHandler,
  ): Promise<void> {
    this.startCalls += 1;
    this.isRecording = true;
    this.handler = handler;
  }

  async stop(): Promise<void> {
    if (!this.isRecording) {
      return;
    }
    this.isRecording = false;
    this.stopCalls += 1;
    const handler = this.handler;
    this.handler = null;
    handler?.onDone();
  }

  async dispose(): Promise<void> {
    this.disposeCalls += 1;
    await this.stop();
  }

  emit(bytes: Uint8Array): void {
    this.handler?.onChunk(bytes);
  }

  emitError(error: unknown): void {
    const handler = this.handler;
    this.handler = null;
    this.isRecording = false;
    handler?.onError(error);
  }
}
