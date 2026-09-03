import AVFoundation
import Foundation

/// PCM wire format shared with the TypeScript side
/// (`src/audio/audioConstants.ts`) and the Android port
/// (`ai.wiro.realtime.audio.AudioConstants`).
///
/// Samples are signed 16-bit little-endian on both directions of the
/// stream; changing the rate means changing it in the Run request
/// and in the local pipeline together, or the audio is garbled.
enum AudioConstants {
    static let sampleRateHz: Double = 24_000
    static let channelCount: AVAudioChannelCount = 1
    static let bitsPerSample = 16
    static let chunkDurationMs = 20
    static let samplesPerChunk = 480
    static let pcmBytesPerChunk = 960
    static let bytesPerSample = bitsPerSample / 8
    static let preferredIoBufferSeconds = 0.02
    static let defaultQueueCapacityInChunks = 50

    /// Wire format for every PCM chunk crossing the bridge, and for
    /// every buffer scheduled on the playback graph.
    static var pcmFormat: AVAudioFormat {
        AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: sampleRateHz,
            channels: channelCount,
            interleaved: true
        )!
    }
}
