export enum RealtimeAudioProfile {
  Conversation = 'Conversation',
  Transcription = 'Transcription',
  Speech = 'Speech',
}

export function requiresMicrophone(profile: RealtimeAudioProfile): boolean {
  switch (profile) {
    case RealtimeAudioProfile.Conversation:
    case RealtimeAudioProfile.Transcription:
      return true;
    case RealtimeAudioProfile.Speech:
      return false;
  }
}

export enum AudioPreparationResult {
  Ready = 'Ready',
  PermissionDenied = 'PermissionDenied',
  PermissionPermanentlyDenied = 'PermissionPermanentlyDenied',
  PermissionRestricted = 'PermissionRestricted',
  ActivationDenied = 'ActivationDenied',
  Unavailable = 'Unavailable',
}

const AudioPermissionCopy = {
  DENIED: 'Microphone permission was denied. Allow access and try again.',
  PERMANENTLY_DENIED:
    'Microphone access is disabled. Enable it in system settings.',
} as const;

export function preparationNeedsSystemSettings(
  result: AudioPreparationResult,
): boolean {
  return result === AudioPreparationResult.PermissionPermanentlyDenied;
}

export function preparationErrorMessage(
  result: AudioPreparationResult,
): string | null {
  switch (result) {
    case AudioPreparationResult.Ready:
      return null;
    case AudioPreparationResult.PermissionDenied:
      return AudioPermissionCopy.DENIED;
    case AudioPreparationResult.PermissionPermanentlyDenied:
      return AudioPermissionCopy.PERMANENTLY_DENIED;
    case AudioPreparationResult.PermissionRestricted:
      return 'Microphone access is restricted on this device.';
    case AudioPreparationResult.ActivationDenied:
      return 'The audio session could not be activated. Try again.';
    case AudioPreparationResult.Unavailable:
      return 'The audio session could not be prepared. Try again.';
  }
}

export enum RealtimeAudioInterruption {
  Began = 'Began',
  Ended = 'Ended',
}

export type Unsubscribe = () => void;

/**
 * Owns the platform audio session shared by every realtime feature.
 *
 * One instance backs the whole app; `prepare`/`deactivate` are
 * called once per session while the subscriptions below live for
 * as long as the session itself.
 */
export interface RealtimeAudioSession {
  onInterruption(
    listener: (interruption: RealtimeAudioInterruption) => void,
  ): Unsubscribe;
  onBecomingNoisy(listener: () => void): Unsubscribe;
  onRouteChanged(listener: () => void): Unsubscribe;

  prepare(profile: RealtimeAudioProfile): Promise<AudioPreparationResult>;

  deactivate(): Promise<void>;

  setSpeakerEnabled(enabled: boolean): Promise<boolean>;

  openSystemSettings(): Promise<boolean>;

  dispose(): Promise<void>;
}
