import { PermissionsAndroid, Platform } from 'react-native';
import NativeWiroPcmAudio from '../../specs/NativeWiroPcmAudio';
import {
  AudioPreparationResult,
  RealtimeAudioInterruption,
  RealtimeAudioProfile,
  RealtimeAudioSession,
  Unsubscribe,
  requiresMicrophone,
} from './realtimeAudioSession';

/**
 * `RealtimeAudioSession` bound to the `WiroPcmAudio` TurboModule.
 *
 * The module itself activates the shared `AudioManager`/
 * `AVAudioSession` state when capture or playback actually opens
 * (see `WiroRealtimeAudioSession` on both platforms), so this
 * class's own job is narrower than its Kotlin/Swift namesakes:
 * gate on microphone permission before a feature spends a billed
 * task, and forward the module's session-wide events.
 *
 * Permission is asked for differently per platform because a
 * TurboModule has no `ComponentActivity` to attach an Android
 * request launcher to: Android goes through `PermissionsAndroid`,
 * which already owns that problem; iOS asks the module directly,
 * since `AVAudioSession` needs no host activity.
 */
export class NativeRealtimeAudioSession implements RealtimeAudioSession {
  onInterruption(
    listener: (interruption: RealtimeAudioInterruption) => void,
  ): Unsubscribe {
    const subscription = NativeWiroPcmAudio.onInterruption(event => {
      listener(
        event.began
          ? RealtimeAudioInterruption.Began
          : RealtimeAudioInterruption.Ended,
      );
    });
    return () => subscription.remove();
  }

  onBecomingNoisy(listener: () => void): Unsubscribe {
    const subscription = NativeWiroPcmAudio.onBecomingNoisy(() => listener());
    return () => subscription.remove();
  }

  onRouteChanged(listener: () => void): Unsubscribe {
    const subscription = NativeWiroPcmAudio.onRouteChanged(() => listener());
    return () => subscription.remove();
  }

  async prepare(
    profile: RealtimeAudioProfile,
  ): Promise<AudioPreparationResult> {
    if (!requiresMicrophone(profile)) {
      return AudioPreparationResult.Ready;
    }
    return Platform.OS === 'android'
      ? this.prepareAndroidMicrophone()
      : this.prepareIosMicrophone();
  }

  async deactivate(): Promise<void> {
    // The module releases its own activation when `stopCapture`/
    // `stopPlayback` run; nothing to release here.
  }

  async setSpeakerEnabled(enabled: boolean): Promise<boolean> {
    return NativeWiroPcmAudio.setSpeakerEnabled(enabled);
  }

  async openSystemSettings(): Promise<boolean> {
    return NativeWiroPcmAudio.openSystemSettings();
  }

  async dispose(): Promise<void> {
    // The native module is one app-wide singleton reused by every
    // feature in turn; only the process teardown truly disposes it.
  }

  private async prepareAndroidMicrophone(): Promise<AudioPreparationResult> {
    const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
    const already = await PermissionsAndroid.check(permission);
    if (already) {
      return AudioPreparationResult.Ready;
    }
    const result = await PermissionsAndroid.request(permission);
    switch (result) {
      case PermissionsAndroid.RESULTS.GRANTED:
        return AudioPreparationResult.Ready;
      case PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN:
        return AudioPreparationResult.PermissionPermanentlyDenied;
      default:
        return AudioPreparationResult.PermissionDenied;
    }
  }

  private async prepareIosMicrophone(): Promise<AudioPreparationResult> {
    const current = await NativeWiroPcmAudio.checkMicrophonePermission();
    if (current === 'granted') {
      return AudioPreparationResult.Ready;
    }
    if (current === 'denied') {
      return AudioPreparationResult.PermissionPermanentlyDenied;
    }
    const requested = await NativeWiroPcmAudio.requestMicrophonePermission();
    return requested === 'granted'
      ? AudioPreparationResult.Ready
      : AudioPreparationResult.PermissionPermanentlyDenied;
  }
}
