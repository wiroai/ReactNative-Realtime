export enum AudioFailureCode {
  CaptureUnavailable = 'CaptureUnavailable',
  PlaybackUnavailable = 'PlaybackUnavailable',
}

/**
 * A stable, machine-readable audio failure with a user-facing
 * message. Singletons only — see `WiroFailure` for why raw
 * platform detail never reaches a caught error.
 */
export class AudioFailure extends Error {
  readonly code: AudioFailureCode;

  constructor(code: AudioFailureCode, message: string) {
    super(message);
    this.name = 'AudioFailure';
    this.code = code;
  }

  toString(): string {
    return this.message;
  }

  static readonly Capture = new AudioFailure(
    AudioFailureCode.CaptureUnavailable,
    'Microphone capture could not be started.',
  );
  static readonly Playback = new AudioFailure(
    AudioFailureCode.PlaybackUnavailable,
    'Audio playback could not be started.',
  );
}
