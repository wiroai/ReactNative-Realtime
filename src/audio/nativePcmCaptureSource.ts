import type { EventSubscription } from 'react-native';
import NativeWiroPcmAudio from '../../specs/NativeWiroPcmAudio';
import { AudioFailure } from './audioFailure';
import { decodeBase64 } from './base64';
import { PcmCaptureHandler, PcmCaptureProfile, PcmCaptureSource } from './capture';

const WIRE_PROFILE: Readonly<Record<PcmCaptureProfile, string>> = {
  [PcmCaptureProfile.Conversation]: 'voice-comm',
  [PcmCaptureProfile.Transcription]: 'recognition',
};

/**
 * `PcmCaptureSource` bound to the `WiroPcmAudio` TurboModule.
 *
 * One instance is shared app-wide — the module owns a single
 * native capture graph — so `BufferedPcmAudioRecorder` above it is
 * what enforces "one recording session at a time" for a feature;
 * this class only forwards to the module.
 */
export class NativePcmCaptureSource implements PcmCaptureSource {
  private subscriptions: EventSubscription[] = [];
  private recording = false;

  get isRecording(): boolean {
    return this.recording;
  }

  async start(
    profile: PcmCaptureProfile,
    handler: PcmCaptureHandler,
  ): Promise<void> {
    this.subscriptions = [
      NativeWiroPcmAudio.onPcmChunk(event => {
        handler.onChunk(decodeBase64(event.chunkBase64));
      }),
      NativeWiroPcmAudio.onCaptureFailure(() => {
        this.teardownSubscriptions();
        this.recording = false;
        handler.onError(AudioFailure.Capture);
      }),
      NativeWiroPcmAudio.onCaptureDone(() => {
        this.teardownSubscriptions();
        this.recording = false;
        handler.onDone();
      }),
    ];
    try {
      await NativeWiroPcmAudio.startCapture(WIRE_PROFILE[profile]);
      this.recording = true;
    } catch (error) {
      this.teardownSubscriptions();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.recording) {
      return;
    }
    this.recording = false;
    this.teardownSubscriptions();
    await NativeWiroPcmAudio.stopCapture();
  }

  async dispose(): Promise<void> {
    await this.stop();
  }

  private teardownSubscriptions(): void {
    this.subscriptions.forEach(subscription => subscription.remove());
    this.subscriptions = [];
  }
}
