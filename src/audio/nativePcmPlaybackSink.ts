import type { EventSubscription } from 'react-native';
import NativeWiroPcmAudio from '../../specs/NativeWiroPcmAudio';
import { encodeBase64 } from './base64';
import { PcmPlaybackProfile, PcmPlaybackSink } from './playback';

const WIRE_PROFILE: Readonly<Record<PcmPlaybackProfile, string>> = {
  [PcmPlaybackProfile.Conversation]: 'conversation',
  [PcmPlaybackProfile.Media]: 'media',
};

/**
 * `PcmPlaybackSink` bound to the `WiroPcmAudio` TurboModule.
 *
 * Mirrors `NativePcmCaptureSource`: a thin forwarder over the
 * shared native module, with `QueuedPcmAudioPlayer` above it owning
 * the actual queueing and backpressure policy.
 */
export class NativePcmPlaybackSink implements PcmPlaybackSink {
  private underrunSubscription: EventSubscription | null = null;

  onUnderrun(listener: () => void): void {
    this.underrunSubscription?.remove();
    this.underrunSubscription = NativeWiroPcmAudio.onUnderrun(() => listener());
  }

  async initialize(profile: PcmPlaybackProfile): Promise<void> {
    await NativeWiroPcmAudio.openPlayback(WIRE_PROFILE[profile]);
  }

  async play(): Promise<void> {
    // Playback starts as soon as `openPlayback` succeeds; nothing
    // further to trigger natively.
  }

  async feed(chunk: Uint8Array): Promise<void> {
    await NativeWiroPcmAudio.feedPlayback(encodeBase64(chunk));
  }

  async flush(): Promise<void> {
    await NativeWiroPcmAudio.flushPlayback();
  }

  async bufferedDurationMs(): Promise<number> {
    return NativeWiroPcmAudio.bufferedPlaybackDurationMs();
  }

  async setVolume(volume: number): Promise<void> {
    await NativeWiroPcmAudio.setPlaybackVolume(volume);
  }

  async endOfStream(): Promise<void> {
    await NativeWiroPcmAudio.endOfStreamPlayback();
  }

  async stop(): Promise<void> {
    await NativeWiroPcmAudio.stopPlayback();
  }

  async dispose(): Promise<void> {
    this.underrunSubscription?.remove();
    this.underrunSubscription = null;
  }
}
