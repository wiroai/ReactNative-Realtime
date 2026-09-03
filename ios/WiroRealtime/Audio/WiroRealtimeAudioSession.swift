import AVFoundation
import UIKit

/// Which profile a session mode maps to, ported from the Android
/// port's `SessionProfile`. `.conversation` drives `.voiceChat` mode
/// (built-in echo cancellation, call-style routing); `.transcription`
/// keeps `.measurement` mode (raw levels, no AGC) but still routes
/// like a call; `.speech` is plain media playback with default
/// routing.
enum SessionProfile {
    case conversation
    case transcription
    case speech

    var voiceCallRoute: Bool { self != .speech }

    var mode: AVAudioSession.Mode {
        switch self {
        case .conversation: return .voiceChat
        case .transcription: return .measurement
        case .speech: return .default
        }
    }
}

/// Why a caller is holding the session open — capture and playback
/// activate/release independently but share one `AVAudioSession`.
enum SessionReason {
    case capture
    case playback
}

enum RealtimeAudioInterruption {
    case began
    case ended
}

struct RouteState {
    let hasWiredHeadset: Bool
    let hasBluetoothRoute: Bool
}

/// Configures the shared `AVAudioSession` category/mode/route and
/// publishes route / interruption events, ref-counted across capture
/// and playback so either side can be active without the other.
///
/// Ported from the Android port's `WiroRealtimeAudioSession`
/// (itself ported from Kotlin-Realtime's
/// `AndroidRealtimeAudioSession`).
final class WiroRealtimeAudioSession {
    private let session = AVAudioSession.sharedInstance()
    private let lock = NSLock()
    private var activeReasons: [SessionReason: SessionProfile] = [:]
    private var disposed = false

    var onInterruption: ((RealtimeAudioInterruption) -> Void)?
    var onBecomingNoisy: (() -> Void)?
    var onRouteChanged: ((RouteState) -> Void)?

    init() {
        let center = NotificationCenter.default
        center.addObserver(
            self,
            selector: #selector(handleInterruption(_:)),
            name: AVAudioSession.interruptionNotification,
            object: session
        )
        center.addObserver(
            self,
            selector: #selector(handleRouteChange(_:)),
            name: AVAudioSession.routeChangeNotification,
            object: session
        )
    }

    /// Activates the shared session for `reason` at `profile`, or
    /// re-routes it if another reason is already active.
    func activate(reason: SessionReason, profile: SessionProfile) throws {
        var wasEmpty = false
        lock.lock()
        if disposed {
            lock.unlock()
            throw AudioFailure.capture
        }
        wasEmpty = activeReasons.isEmpty
        activeReasons[reason] = profile
        lock.unlock()

        do {
            if wasEmpty {
                try session.setCategory(
                    .playAndRecord,
                    mode: effectiveMode(),
                    options: [.allowBluetoothHFP, .allowBluetoothA2DP, .defaultToSpeaker]
                )
                try session.setActive(true)
            } else {
                try session.setMode(effectiveMode())
            }
        } catch {
            lock.lock()
            activeReasons.removeValue(forKey: reason)
            lock.unlock()
            throw AudioFailure.capture
        }
        applyRoute()
    }

    /// Releases `reason`'s hold on the session; tears everything down
    /// once no reason remains active.
    func release(reason: SessionReason) {
        lock.lock()
        activeReasons.removeValue(forKey: reason)
        let stillActive = !activeReasons.isEmpty
        lock.unlock()

        if stillActive {
            try? session.setMode(effectiveMode())
            applyRoute()
            return
        }
        CommunicationRoute.clear(session)
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
    }

    func setSpeakerEnabled(_ enabled: Bool) -> Bool {
        do {
            try session.overrideOutputAudioPort(enabled ? .speaker : .none)
            return true
        } catch {
            return false
        }
    }

    func currentRouteState() -> RouteState {
        RouteState(
            hasWiredHeadset: CommunicationRoute.hasWiredHeadset(session),
            hasBluetoothRoute: CommunicationRoute.hasBluetoothRoute(session)
        )
    }

    func dispose() {
        lock.lock()
        if disposed {
            lock.unlock()
            return
        }
        disposed = true
        activeReasons.removeAll()
        lock.unlock()

        NotificationCenter.default.removeObserver(self)
        CommunicationRoute.clear(session)
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func effectiveMode() -> AVAudioSession.Mode {
        lock.lock()
        let profiles = Array(activeReasons.values)
        lock.unlock()
        if profiles.contains(.conversation) {
            return .voiceChat
        }
        if profiles.contains(.transcription) {
            return .measurement
        }
        return .default
    }

    private func applyRoute() {
        lock.lock()
        let profiles = Array(activeReasons.values)
        lock.unlock()
        guard !profiles.isEmpty else { return }
        CommunicationRoute.apply(session, voiceCall: profiles.contains { $0.voiceCallRoute })
    }

    @objc private func handleInterruption(_ notification: Notification) {
        guard let info = notification.userInfo,
              let rawType = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: rawType)
        else { return }
        onInterruption?(type == .began ? .began : .ended)
    }

    @objc private func handleRouteChange(_ notification: Notification) {
        guard let info = notification.userInfo,
              let rawReason = info[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: rawReason)
        else { return }
        applyRoute()
        onRouteChanged?(currentRouteState())
        if reason == .oldDeviceUnavailable {
            onBecomingNoisy?()
        }
    }
}
