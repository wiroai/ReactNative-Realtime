import Foundation

/// Slices an arbitrary byte stream into fixed-size PCM frames,
/// carrying any remainder to the next call. `AVAudioEngine` tap
/// buffers vary in size with the hardware's I/O buffer duration, but
/// the wire format needs exact `AudioConstants.pcmBytesPerChunk`
/// frames — mirrors `ai.wiro.realtime.audio.PcmChunker` on Android
/// and `src/audio/pcmChunker.ts`.
final class PcmChunker {
    let chunkSizeInBytes: Int
    private var remainder = Data()

    init(chunkSizeInBytes: Int) {
        precondition(chunkSizeInBytes > 0, "Chunk size must be positive.")
        self.chunkSizeInBytes = chunkSizeInBytes
    }

    var remainderLength: Int { remainder.count }

    func add(_ bytes: Data) -> [Data] {
        guard !bytes.isEmpty else { return [] }
        var combined = remainder
        combined.append(bytes)

        var chunks: [Data] = []
        var offset = 0
        while combined.count - offset >= chunkSizeInBytes {
            let end = offset + chunkSizeInBytes
            chunks.append(combined.subdata(in: offset..<end))
            offset = end
        }
        remainder = combined.subdata(in: offset..<combined.count)
        return chunks
    }

    func reset() {
        remainder = Data()
    }
}
