import AVFoundation

/// Headset first, then the loudspeaker.
///
/// `.playAndRecord` + `.voiceChat` otherwise plays from the earpiece,
/// which is wrong for a speaker facing a phone. A wired or Bluetooth
/// headset still wins, since `overrideOutputAudioPort(.none)` lets
/// the system route to whatever external device is connected.
/// Mirrors `ai.wiro.realtime.audio.CommunicationRoute` on Android.
enum CommunicationRoute {
    static func apply(_ session: AVAudioSession, voiceCall: Bool) {
        guard voiceCall else {
            clear(session)
            return
        }
        let hasExternalRoute = hasWiredHeadset(session) || hasBluetoothRoute(session)
        do {
            try session.overrideOutputAudioPort(hasExternalRoute ? .none : .speaker)
        } catch {
            // Best-effort: a failed override leaves the previous route
            // in place rather than blocking capture/playback.
        }
    }

    static func clear(_ session: AVAudioSession) {
        try? session.overrideOutputAudioPort(.none)
    }

    static func hasWiredHeadset(_ session: AVAudioSession) -> Bool {
        session.currentRoute.outputs.contains { isWired($0) }
    }

    static func hasBluetoothRoute(_ session: AVAudioSession) -> Bool {
        session.currentRoute.outputs.contains { isBluetooth($0) }
    }

    private static func isWired(_ port: AVAudioSessionPortDescription) -> Bool {
        port.portType == .headphones || port.portType == .usbAudio
    }

    private static func isBluetooth(_ port: AVAudioSessionPortDescription) -> Bool {
        port.portType == .bluetoothA2DP ||
            port.portType == .bluetoothHFP ||
            port.portType == .bluetoothLE
    }
}
