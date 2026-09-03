import Foundation

enum AudioFailureCode: String {
    case captureUnavailable = "CaptureUnavailable"
    case playbackUnavailable = "PlaybackUnavailable"
}

/// Mirrors `ai.wiro.realtime.audio.AudioFailure` on Android and
/// `AudioFailure` in `src/audio/audioFailure.ts`.
struct AudioFailure: Error, CustomStringConvertible {
    let code: AudioFailureCode
    let message: String

    var description: String { message }

    static let capture = AudioFailure(
        code: .captureUnavailable,
        message: "Microphone capture could not be started."
    )
    static let playback = AudioFailure(
        code: .playbackUnavailable,
        message: "Audio playback could not be started."
    )
}
