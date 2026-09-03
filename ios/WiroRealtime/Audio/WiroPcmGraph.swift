import AVFoundation

/// `voice-comm` binds the platform echo canceller and follows the
/// call route; `recognition` is a plain microphone tap with no AEC
/// bind, for transcription-only capture. Mirrors
/// `WiroPcmCaptureProfile` in `specs/NativeWiroPcmAudio.ts`.
enum PcmCaptureProfile {
    case conversation
    case transcription

    static func parse(_ raw: String) -> PcmCaptureProfile? {
        switch raw {
        case "voice-comm": return .conversation
        case "recognition": return .transcription
        default: return nil
        }
    }
}

/// `conversation` follows the same AEC/voice-comm route as capture;
/// `media` is plain listening, out of the loudspeaker by default.
/// Mirrors `WiroPcmPlaybackProfile`.
enum PcmPlaybackProfile {
    case conversation
    case media

    static func parse(_ raw: String) -> PcmPlaybackProfile? {
        switch raw {
        case "conversation": return .conversation
        case "media": return .media
        default: return nil
        }
    }

    var wireValue: String {
        switch self {
        case .conversation: return "conversation"
        case .media: return "media"
        }
    }
}

/// Shared capture and playback graph built on one `AVAudioEngine`:
/// the input node's tap (converted to the wire format) drives
/// capture, and an `AVAudioPlayerNode` drives playback. Keeping both
/// directions on one engine instance is what lets
/// `setVoiceProcessingEnabled` provide echo cancellation during a
/// conversation turn — matching why Kotlin-Realtime's
/// `AndroidPcmGraph` keeps one `AudioRecord`/`AudioTrack` pair
/// together instead of two independent graphs.
final class WiroPcmGraph {
    private let engine = AVAudioEngine()
    private let playerNode = AVAudioPlayerNode()
    private let lock = NSLock()

    private var recording = false
    private var disposed = false
    private var playbackOpen = false
    private var playerAttached = false
    private var captureProfile: PcmCaptureProfile?
    private let chunker = PcmChunker(chunkSizeInBytes: AudioConstants.pcmBytesPerChunk)
    private var pendingPlaybackFrames: Int64 = 0

    var onPcmChunk: ((Data) -> Void)?
    var onCaptureFailure: ((Error) -> Void)?
    var onCaptureDone: (() -> Void)?
    var onUnderrun: (() -> Void)?

    var isRecording: Bool {
        lock.lock(); defer { lock.unlock() }
        return recording
    }

    init() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleConfigurationChange),
            name: .AVAudioEngineConfigurationChange,
            object: engine
        )
    }

    func startCapture(profile: PcmCaptureProfile) throws {
        lock.lock()
        if disposed || recording {
            lock.unlock()
            throw AudioFailure.capture
        }
        recording = true
        captureProfile = profile
        lock.unlock()
        chunker.reset()

        do {
            try installCaptureTap(profile: profile)
            try ensureEngineRunning()
        } catch {
            lock.lock()
            recording = false
            lock.unlock()
            throw AudioFailure.capture
        }
    }

    func stopCapture() {
        lock.lock()
        guard recording else {
            lock.unlock()
            return
        }
        recording = false
        captureProfile = nil
        lock.unlock()
        engine.inputNode.removeTap(onBus: 0)
        try? engine.inputNode.setVoiceProcessingEnabled(false)
        stopEngineIfIdle()
    }

    func initializePlayback(profile: PcmPlaybackProfile) throws {
        lock.lock()
        if disposed {
            lock.unlock()
            throw AudioFailure.playback
        }
        playbackOpen = true
        lock.unlock()
        do {
            try ensureEngineRunning()
        } catch {
            lock.lock()
            playbackOpen = false
            lock.unlock()
            throw AudioFailure.playback
        }
    }

    func feed(_ chunk: Data) throws {
        lock.lock()
        let open = playbackOpen && !disposed
        lock.unlock()
        guard open else { throw AudioFailure.playback }
        guard let buffer = makeBuffer(from: chunk) else { throw AudioFailure.playback }

        lock.lock()
        pendingPlaybackFrames += Int64(buffer.frameLength)
        lock.unlock()

        playerNode.scheduleBuffer(
            buffer,
            at: nil,
            options: [],
            completionCallbackType: .dataPlayedBack
        ) { [weak self] _ in
            self?.handlePlaybackBufferConsumed(frameLength: Int64(buffer.frameLength))
        }
        if !playerNode.isPlaying {
            playerNode.play()
        }
    }

    func flush() {
        playerNode.stop()
        lock.lock()
        pendingPlaybackFrames = 0
        lock.unlock()
    }

    func bufferedDurationMs() -> Double {
        lock.lock()
        let frames = pendingPlaybackFrames
        lock.unlock()
        guard frames > 0 else { return 0 }
        return Double(frames) / AudioConstants.sampleRateHz * 1000
    }

    /// Polls until the track drains, capped so a stuck native buffer
    /// can't hang the caller's promise forever.
    func endOfStream(timeoutMs: Int = 10_000) {
        let deadline = Date().addingTimeInterval(Double(timeoutMs) / 1000)
        while bufferedDurationMs() > 0 && Date() < deadline {
            Thread.sleep(forTimeInterval: 0.01)
        }
    }

    func stopPlayback() {
        playerNode.stop()
        lock.lock()
        pendingPlaybackFrames = 0
        playbackOpen = false
        lock.unlock()
        stopEngineIfIdle()
    }

    func setVolume(_ volume: Double) {
        playerNode.volume = Float(max(0, min(1, volume)))
    }

    func dispose() {
        lock.lock()
        if disposed {
            lock.unlock()
            return
        }
        disposed = true
        let wasRecording = recording
        recording = false
        playbackOpen = false
        lock.unlock()

        NotificationCenter.default.removeObserver(self)
        if wasRecording {
            engine.inputNode.removeTap(onBus: 0)
            try? engine.inputNode.setVoiceProcessingEnabled(false)
        }
        playerNode.stop()
        if engine.isRunning {
            engine.stop()
        }
        if playerAttached {
            engine.disconnectNodeOutput(playerNode)
            engine.detach(playerNode)
            playerAttached = false
        }
    }

    private func installCaptureTap(profile: PcmCaptureProfile) throws {
        let input = engine.inputNode
        // Voice-processing (built-in AEC/AGC) only for conversation;
        // recognition wants a raw tap so ASR doesn't see the pitch
        // shifts the voice processor can introduce. The toggle is
        // only honoured on a stopped engine, so a graph that is
        // already playing (Speech, then Conversation) is paused for
        // it and restarted by `ensureEngineRunning`.
        let wantsVoiceProcessing = profile == .conversation
        if input.isVoiceProcessingEnabled != wantsVoiceProcessing {
            if engine.isRunning {
                engine.stop()
            }
            try? input.setVoiceProcessingEnabled(wantsVoiceProcessing)
        }
        attachPlayerIfNeeded()
        // The input node reports a 0 Hz / 0-channel format until the
        // engine has been prepared once after a voice-processing
        // change; installing a tap with that format is an
        // uncatchable NSException, not a Swift error.
        engine.prepare()

        let inputFormat = input.outputFormat(forBus: 0)
        guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else {
            throw AudioFailure.capture
        }
        guard let converter = AVAudioConverter(from: inputFormat, to: AudioConstants.pcmFormat) else {
            throw AudioFailure.capture
        }
        let bufferSize = AVAudioFrameCount(
            max(256, inputFormat.sampleRate * AudioConstants.preferredIoBufferSeconds)
        )
        input.installTap(onBus: 0, bufferSize: bufferSize, format: inputFormat) { [weak self] buffer, _ in
            self?.handleCapturedBuffer(buffer, converter: converter)
        }
    }

    private func handleCapturedBuffer(_ buffer: AVAudioPCMBuffer, converter: AVAudioConverter) {
        guard isRecording else { return }
        let ratio = AudioConstants.sampleRateHz / buffer.format.sampleRate
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 16
        guard let outputBuffer = AVAudioPCMBuffer(
            pcmFormat: AudioConstants.pcmFormat,
            frameCapacity: capacity
        ) else { return }

        var conversionError: NSError?
        var inputConsumed = false
        let status = converter.convert(to: outputBuffer, error: &conversionError) { _, outStatus in
            if inputConsumed {
                outStatus.pointee = .noDataNow
                return nil
            }
            inputConsumed = true
            outStatus.pointee = .haveData
            return buffer
        }

        guard status != .error, let data = outputBuffer.int16Data, !data.isEmpty else {
            return
        }
        for chunk in chunker.add(data) {
            onPcmChunk?(chunk)
        }
    }

    private func handlePlaybackBufferConsumed(frameLength: Int64) {
        lock.lock()
        pendingPlaybackFrames -= frameLength
        let ranDry = pendingPlaybackFrames <= 0 && playbackOpen
        lock.unlock()
        // AVAudioEngine has no public underrun notification; treating
        // "queue drained while still open" as an underrun mirrors what
        // Android observes from AudioTrack directly.
        if ranDry {
            onUnderrun?()
        }
    }

    private func makeBuffer(from chunk: Data) -> AVAudioPCMBuffer? {
        let frameLength = AVAudioFrameCount(chunk.count / AudioConstants.bytesPerSample)
        guard frameLength > 0,
              let buffer = AVAudioPCMBuffer(pcmFormat: AudioConstants.pcmFormat, frameCapacity: frameLength),
              let channelData = buffer.int16ChannelData
        else { return nil }
        buffer.frameLength = frameLength
        chunk.withUnsafeBytes { rawBuffer in
            guard let source = rawBuffer.bindMemory(to: Int16.self).baseAddress else { return }
            channelData[0].update(from: source, count: Int(frameLength))
        }
        return buffer
    }

    private func attachPlayerIfNeeded() {
        guard !playerAttached else { return }
        engine.attach(playerNode)
        engine.connect(playerNode, to: engine.mainMixerNode, format: AudioConstants.pcmFormat)
        playerAttached = true
    }

    private func ensureEngineRunning() throws {
        attachPlayerIfNeeded()
        if !engine.isRunning {
            engine.prepare()
            try engine.start()
        }
    }

    private func stopEngineIfIdle() {
        lock.lock()
        let stillNeeded = recording || playbackOpen
        lock.unlock()
        if !stillNeeded && engine.isRunning {
            engine.stop()
        }
    }

    /// Route changes (headset plugged in, Bluetooth connected) can
    /// invalidate the input node's format underneath an active tap.
    /// Reinstalling with the current profile mirrors Android
    /// re-attaching the echo canceller on `AudioDeviceCallback`
    /// events.
    @objc private func handleConfigurationChange() {
        lock.lock()
        let wasRecording = recording
        let profile = captureProfile
        lock.unlock()
        guard wasRecording, let profile else { return }
        engine.inputNode.removeTap(onBus: 0)
        do {
            try installCaptureTap(profile: profile)
            try ensureEngineRunning()
        } catch {
            lock.lock()
            recording = false
            lock.unlock()
            onCaptureFailure?(AudioFailure.capture)
        }
    }
}

private extension AVAudioPCMBuffer {
    var int16Data: Data? {
        guard let channelData = int16ChannelData else { return nil }
        let byteCount = Int(frameLength) * Int(format.channelCount) * AudioConstants.bytesPerSample
        guard byteCount > 0 else { return nil }
        return Data(bytes: channelData[0], count: byteCount)
    }
}
