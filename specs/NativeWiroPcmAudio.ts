import type { TurboModule } from 'react-native';
import { CodegenTypes, TurboModuleRegistry } from 'react-native';

/**
 * TurboModule codegen spec for the native PCM audio graph, one per
 * platform: `AndroidPcmGraph` (AudioRecord/AudioTrack) on Android,
 * an `AVAudioEngine` voice-processing graph on iOS.
 *
 * PCM on both directions of the wire is signed 16-bit, 24 kHz,
 * mono, little-endian — see `AudioConstants` in `src/audio`.
 *
 * Every chunk crosses as base64 text, not `ArrayBuffer`: codegen
 * event emitters never accept `ArrayBuffer` payloads, and this
 * React Native release's Java TurboModule generator rejects it as
 * a method argument too (`ArrayBuffer is only supported for C++
 * TurboModules`), even though the Objective-C generator accepts
 * it. Base64 on both directions keeps one spec working on both
 * platforms instead of forking the wire format per platform.
 */

/** `voice-comm` binds the platform echo canceller and follows the
 * call route (earpiece unless a headset or Bluetooth SCO device is
 * active); `recognition` is a plain microphone tap with no AEC
 * bind, for transcription-only capture. */
export type WiroPcmCaptureProfile = string;

/** `conversation` follows the same AEC/voice-comm route as capture;
 * `media` is plain listening, out of the loudspeaker by default. */
export type WiroPcmPlaybackProfile = string;

export type WiroPcmChunkEvent = Readonly<{
  chunkBase64: string;
}>;

export type WiroPcmCaptureFailureEvent = Readonly<{
  message: string;
}>;

export type WiroPcmPlaybackFailureEvent = Readonly<{
  message: string;
}>;

export type WiroPcmUnderrunEvent = Readonly<{
  profile: string;
}>;

export type WiroPcmRouteChangedEvent = Readonly<{
  hasWiredHeadset: boolean;
  hasBluetoothRoute: boolean;
}>;

export type WiroPcmInterruptionEvent = Readonly<{
  began: boolean;
}>;

/** `granted` | `denied` | `undetermined` | `restricted` — mirrors
 * `AVAudioSession.RecordPermission` on iOS; Android is checked from
 * JS via `PermissionsAndroid` instead (a TurboModule has no
 * `ComponentActivity` to attach a request launcher to), so its
 * implementation only ever reports `granted` or `denied`. */
export type WiroMicrophonePermission = string;

export interface Spec extends TurboModule {
  // Microphone permission — iOS only in practice; see
  // `WiroMicrophonePermission`.
  checkMicrophonePermission(): Promise<WiroMicrophonePermission>;
  requestMicrophonePermission(): Promise<WiroMicrophonePermission>;

  // Capture — one active session at a time.
  startCapture(profile: WiroPcmCaptureProfile): Promise<void>;
  stopCapture(): Promise<void>;
  setCaptureMuted(muted: boolean): void;

  // Playback.
  openPlayback(profile: WiroPcmPlaybackProfile): Promise<void>;
  feedPlayback(chunkBase64: string): Promise<void>;
  flushPlayback(): Promise<void>;
  endOfStreamPlayback(): Promise<void>;
  stopPlayback(): Promise<void>;
  bufferedPlaybackDurationMs(): Promise<CodegenTypes.Double>;
  setPlaybackVolume(volume: CodegenTypes.Double): Promise<void>;

  // Cross-cutting call controls shared by capture and playback.
  setSpeakerEnabled(enabled: boolean): Promise<boolean>;
  openSystemSettings(): Promise<boolean>;
  dispose(): Promise<void>;

  // Capture events.
  readonly onPcmChunk: CodegenTypes.EventEmitter<WiroPcmChunkEvent>;
  readonly onCaptureFailure: CodegenTypes.EventEmitter<WiroPcmCaptureFailureEvent>;
  readonly onCaptureDone: CodegenTypes.EventEmitter<void>;

  // Playback events.
  readonly onPlaybackFailure: CodegenTypes.EventEmitter<WiroPcmPlaybackFailureEvent>;
  readonly onUnderrun: CodegenTypes.EventEmitter<WiroPcmUnderrunEvent>;

  // Session-wide audio route events, shared by capture and
  // playback.
  readonly onRouteChanged: CodegenTypes.EventEmitter<WiroPcmRouteChangedEvent>;
  readonly onInterruption: CodegenTypes.EventEmitter<WiroPcmInterruptionEvent>;
  readonly onBecomingNoisy: CodegenTypes.EventEmitter<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('WiroPcmAudio');
