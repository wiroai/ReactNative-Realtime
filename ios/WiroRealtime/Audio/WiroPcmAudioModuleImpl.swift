import AVFoundation
import Foundation
import React
import UIKit

/// Swift implementation behind the `WiroPcmAudio` TurboModule.
///
/// Kept separate from the Objective-C++ bridge
/// (`WiroPcmAudioModule.mm`) because the codegen base class
/// (`NativeWiroPcmAudioSpecBase`) touches C++ types directly in its
/// header, which Swift cannot subclass; the bridge is a thin
/// forwarding shim instead. All lifecycle calls are serialized on a
/// dedicated queue so start/stop/feed calls from JS can never
/// interleave and corrupt graph state — mirrors the Android port's
/// single-threaded `moduleDispatcher`.
@objc final class WiroPcmAudioModuleImpl: NSObject {
    private let queue = DispatchQueue(label: "ai.wiro.realtime.audio.module", qos: .userInitiated)
    private let graph = WiroPcmGraph()
    private let session = WiroRealtimeAudioSession()

    private let muteLock = NSLock()
    private var captureMutedValue = false
    private var currentPlaybackProfile: PcmPlaybackProfile?

    @objc var onPcmChunk: ((String) -> Void)?
    @objc var onCaptureFailure: ((String) -> Void)?
    @objc var onCaptureDone: (() -> Void)?
    @objc var onPlaybackFailure: ((String) -> Void)?
    @objc var onUnderrun: ((String) -> Void)?
    @objc var onRouteChanged: ((Bool, Bool) -> Void)?
    @objc var onInterruption: ((Bool) -> Void)?
    @objc var onBecomingNoisy: (() -> Void)?

    override init() {
        super.init()

        graph.onPcmChunk = { [weak self] data in
            guard let self, !self.isCaptureMuted else { return }
            self.onPcmChunk?(data.base64EncodedString())
        }
        graph.onCaptureFailure = { [weak self] error in
            self?.session.release(reason: .capture)
            self?.onCaptureFailure?(String(describing: error))
        }
        graph.onCaptureDone = { [weak self] in
            self?.onCaptureDone?()
        }
        graph.onUnderrun = { [weak self] in
            guard let self, let profile = self.currentPlaybackProfile else { return }
            self.onUnderrun?(profile.wireValue)
        }

        session.onInterruption = { [weak self] interruption in
            self?.onInterruption?(interruption == .began)
        }
        session.onBecomingNoisy = { [weak self] in
            self?.onBecomingNoisy?()
        }
        session.onRouteChanged = { [weak self] route in
            self?.onRouteChanged?(route.hasWiredHeadset, route.hasBluetoothRoute)
        }
    }

    private var isCaptureMuted: Bool {
        muteLock.lock()
        defer { muteLock.unlock() }
        return captureMutedValue
    }

    /// Permission stays JS-owned on Android (see
    /// `specs/NativeWiroPcmAudio.ts`); on iOS `AVAudioSession` is the
    /// only place that knows the answer, so this reports it directly
    /// instead of routing through a JS-only permissions API.
    @objc(checkMicrophonePermissionWithResolve:reject:)
    func checkMicrophonePermission(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        resolve(Self.wireValue(for: AVAudioSession.sharedInstance().recordPermission))
    }

    @objc(requestMicrophonePermissionWithResolve:reject:)
    func requestMicrophonePermission(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            resolve(granted ? "granted" : "denied")
        }
    }

    private static func wireValue(for permission: AVAudioSession.RecordPermission) -> String {
        switch permission {
        case .granted: return "granted"
        case .denied: return "denied"
        case .undetermined: return "undetermined"
        @unknown default: return "undetermined"
        }
    }

    @objc(startCaptureWithProfile:resolve:reject:)
    func startCapture(profile rawProfile: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard let profile = PcmCaptureProfile.parse(rawProfile) else {
            reject("invalid_profile", "Unknown capture profile: \(rawProfile)", nil)
            return
        }
        queue.async { [weak self] in
            guard let self else { return }
            do {
                try self.session.activate(reason: .capture, profile: self.sessionProfile(forCapture: profile))
                try self.graph.startCapture(profile: profile)
                resolve(nil)
            } catch {
                self.session.release(reason: .capture)
                reject("capture_start_failed", String(describing: error), error)
            }
        }
    }

    @objc(stopCaptureWithResolve:reject:)
    func stopCapture(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        queue.async { [weak self] in
            guard let self else { return }
            self.graph.stopCapture()
            self.session.release(reason: .capture)
            resolve(nil)
        }
    }

    @objc(setCaptureMuted:)
    func setCaptureMuted(_ muted: Bool) {
        muteLock.lock()
        captureMutedValue = muted
        muteLock.unlock()
    }

    @objc(openPlaybackWithProfile:resolve:reject:)
    func openPlayback(profile rawProfile: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard let profile = PcmPlaybackProfile.parse(rawProfile) else {
            reject("invalid_profile", "Unknown playback profile: \(rawProfile)", nil)
            return
        }
        queue.async { [weak self] in
            guard let self else { return }
            do {
                try self.session.activate(reason: .playback, profile: self.sessionProfile(forPlayback: profile))
                try self.graph.initializePlayback(profile: profile)
                self.currentPlaybackProfile = profile
                resolve(nil)
            } catch {
                self.session.release(reason: .playback)
                reject("open_playback_failed", String(describing: error), error)
            }
        }
    }

    @objc(feedPlaybackWithChunkBase64:resolve:reject:)
    func feedPlayback(chunkBase64: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard let data = Data(base64Encoded: chunkBase64) else {
            reject("invalid_chunk", "Playback chunk was not valid base64.", nil)
            return
        }
        queue.async { [weak self] in
            guard let self else { return }
            do {
                try self.graph.feed(data)
                resolve(nil)
            } catch {
                self.onPlaybackFailure?(String(describing: error))
                reject("feed_playback_failed", String(describing: error), error)
            }
        }
    }

    @objc(flushPlaybackWithResolve:reject:)
    func flushPlayback(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        queue.async { [weak self] in
            self?.graph.flush()
            resolve(nil)
        }
    }

    @objc(endOfStreamPlaybackWithResolve:reject:)
    func endOfStreamPlayback(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        queue.async { [weak self] in
            self?.graph.endOfStream()
            resolve(nil)
        }
    }

    @objc(stopPlaybackWithResolve:reject:)
    func stopPlayback(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        queue.async { [weak self] in
            guard let self else { return }
            self.graph.stopPlayback()
            self.session.release(reason: .playback)
            self.currentPlaybackProfile = nil
            resolve(nil)
        }
    }

    @objc(bufferedPlaybackDurationMsWithResolve:reject:)
    func bufferedPlaybackDurationMs(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        queue.async { [weak self] in
            resolve(self?.graph.bufferedDurationMs() ?? 0)
        }
    }

    @objc(setPlaybackVolume:resolve:reject:)
    func setPlaybackVolume(_ volume: Double, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        queue.async { [weak self] in
            self?.graph.setVolume(volume)
            resolve(nil)
        }
    }

    @objc(setSpeakerEnabled:resolve:reject:)
    func setSpeakerEnabled(_ enabled: Bool, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        queue.async { [weak self] in
            resolve(self?.session.setSpeakerEnabled(enabled) ?? false)
        }
    }

    @objc(openSystemSettingsWithResolve:reject:)
    func openSystemSettings(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
            resolve(false)
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { success in
                resolve(success)
            }
        }
    }

    @objc(disposeWithResolve:reject:)
    func dispose(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        queue.async { [weak self] in
            self?.graph.dispose()
            self?.session.dispose()
            resolve(nil)
        }
    }

    private func sessionProfile(forCapture profile: PcmCaptureProfile) -> SessionProfile {
        switch profile {
        case .conversation: return .conversation
        case .transcription: return .transcription
        }
    }

    private func sessionProfile(forPlayback profile: PcmPlaybackProfile) -> SessionProfile {
        switch profile {
        case .conversation: return .conversation
        case .media: return .speech
        }
    }
}
