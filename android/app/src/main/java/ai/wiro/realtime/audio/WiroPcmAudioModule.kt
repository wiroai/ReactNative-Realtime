package ai.wiro.realtime.audio

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import android.util.Base64
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onCompletion
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.time.DurationUnit

private fun PcmCaptureProfile.toSessionProfile(): SessionProfile = when (this) {
    PcmCaptureProfile.Conversation -> SessionProfile.Conversation
    PcmCaptureProfile.Transcription -> SessionProfile.Transcription
}

private fun PcmPlaybackProfile.toSessionProfile(): SessionProfile = when (this) {
    PcmPlaybackProfile.Conversation -> SessionProfile.Conversation
    PcmPlaybackProfile.Media -> SessionProfile.Speech
}

private val PcmPlaybackProfile.wireValue: String
    get() = when (this) {
        PcmPlaybackProfile.Conversation -> "conversation"
        PcmPlaybackProfile.Media -> "media"
    }

/**
 * TurboModule implementation of `NativeWiroPcmAudio` — the Android
 * side of the capture/playback graph, ported from Kotlin-Realtime's
 * `AndroidPcmGraph` +
 * `AndroidRealtimeAudioSession`.
 *
 * All chunk payloads cross the bridge as base64 (see
 * `specs/NativeWiroPcmAudio.ts` for why `ArrayBuffer` isn't an
 * option here). Every lifecycle call runs serialized on a
 * single-threaded dispatcher so start/stop/feed calls from JS can
 * never interleave and corrupt graph state.
 */
class WiroPcmAudioModule(
    reactContext: ReactApplicationContext,
) : NativeWiroPcmAudioSpec(reactContext) {

    private val moduleDispatcher = Dispatchers.IO.limitedParallelism(1)
    private val moduleScope = CoroutineScope(SupervisorJob() + moduleDispatcher)

    private val graph = WiroPcmGraph()
    private val session = WiroRealtimeAudioSession(reactContext)

    private val captureMuted = AtomicBoolean(false)

    @Volatile
    private var captureJob: Job? = null

    @Volatile
    private var currentPlaybackProfile: PcmPlaybackProfile? = null

    init {
        session.interruptions.onEach { interruption ->
            emitOnInterruption(
                Arguments.createMap().apply {
                    putBoolean("began", interruption == RealtimeAudioInterruption.Began)
                },
            )
        }.launchIn(moduleScope)

        session.becomingNoisy.onEach {
            emitOnBecomingNoisy()
        }.launchIn(moduleScope)

        session.routeChanges.onEach { route ->
            emitOnRouteChanged(
                Arguments.createMap().apply {
                    putBoolean("hasWiredHeadset", route.hasWiredHeadset)
                    putBoolean("hasBluetoothRoute", route.hasBluetoothRoute)
                },
            )
        }.launchIn(moduleScope)

        graph.underruns.onEach {
            val profile = currentPlaybackProfile ?: return@onEach
            emitOnUnderrun(
                Arguments.createMap().apply {
                    putString("profile", profile.wireValue)
                },
            )
        }.launchIn(moduleScope)
    }

    // Permission stays JS-owned here (see `WiroRealtimeAudioSession`'s
    // doc comment): the JS side always drives `PermissionsAndroid`,
    // which has the host `Activity` a request launcher needs. This
    // exists only so the shared spec has an Android implementation
    // to call — it always resolves the check without ever prompting.
    override fun checkMicrophonePermission(promise: Promise) {
        promise.resolve(currentMicrophonePermissionWireValue())
    }

    override fun requestMicrophonePermission(promise: Promise) {
        promise.resolve(currentMicrophonePermissionWireValue())
    }

    private fun currentMicrophonePermissionWireValue(): String {
        val granted = ContextCompat.checkSelfPermission(
            reactApplicationContext,
            Manifest.permission.RECORD_AUDIO,
        ) == PackageManager.PERMISSION_GRANTED
        return if (granted) "granted" else "denied"
    }

    override fun startCapture(profile: String, promise: Promise) {
        val parsed = PcmCaptureProfile.parse(profile)
        if (parsed == null) {
            promise.reject("invalid_profile", "Unknown capture profile: $profile")
            return
        }
        moduleScope.launch {
            try {
                session.activate(SessionReason.Capture, parsed.toSessionProfile())
                val flow = graph.startCapture(parsed)
                captureJob = flow
                    .onEach { bytes ->
                        if (captureMuted.get()) {
                            return@onEach
                        }
                        emitOnPcmChunk(
                            Arguments.createMap().apply {
                                putString(
                                    "chunkBase64",
                                    Base64.encodeToString(bytes, Base64.NO_WRAP),
                                )
                            },
                        )
                    }
                    .onCompletion { cause ->
                        session.release(SessionReason.Capture)
                        if (cause != null) {
                            emitOnCaptureFailure(
                                Arguments.createMap().apply {
                                    putString(
                                        "message",
                                        cause.message ?: AudioFailure.Capture.message,
                                    )
                                },
                            )
                        } else {
                            emitOnCaptureDone()
                        }
                    }
                    .catch { /* already reported via onCompletion above */ }
                    .launchIn(moduleScope)
                promise.resolve(null)
            } catch (error: Throwable) {
                session.release(SessionReason.Capture)
                promise.reject("capture_start_failed", error.message, error)
            }
        }
    }

    override fun stopCapture(promise: Promise) {
        moduleScope.launch {
            try {
                graph.stopCapture()
                promise.resolve(null)
            } catch (error: Throwable) {
                promise.reject("capture_stop_failed", error.message, error)
            }
        }
    }

    override fun setCaptureMuted(muted: Boolean) {
        captureMuted.set(muted)
    }

    override fun openPlayback(profile: String, promise: Promise) {
        val parsed = PcmPlaybackProfile.parse(profile)
        if (parsed == null) {
            promise.reject("invalid_profile", "Unknown playback profile: $profile")
            return
        }
        moduleScope.launch {
            try {
                session.activate(SessionReason.Playback, parsed.toSessionProfile())
                graph.initializePlayback(parsed)
                currentPlaybackProfile = parsed
                promise.resolve(null)
            } catch (error: Throwable) {
                session.release(SessionReason.Playback)
                promise.reject("open_playback_failed", error.message, error)
            }
        }
    }

    override fun feedPlayback(chunkBase64: String, promise: Promise) {
        val bytes = try {
            Base64.decode(chunkBase64, Base64.NO_WRAP)
        } catch (error: Throwable) {
            promise.reject("invalid_chunk", "Playback chunk was not valid base64.", error)
            return
        }
        moduleScope.launch {
            try {
                graph.feed(bytes)
                promise.resolve(null)
            } catch (error: Throwable) {
                emitOnPlaybackFailure(
                    Arguments.createMap().apply {
                        putString("message", error.message ?: AudioFailure.Playback.message)
                    },
                )
                promise.reject("feed_playback_failed", error.message, error)
            }
        }
    }

    override fun flushPlayback(promise: Promise) {
        moduleScope.launch {
            try {
                graph.flush()
                promise.resolve(null)
            } catch (error: Throwable) {
                promise.reject("flush_playback_failed", error.message, error)
            }
        }
    }

    override fun endOfStreamPlayback(promise: Promise) {
        moduleScope.launch {
            try {
                graph.endOfStream()
                promise.resolve(null)
            } catch (error: Throwable) {
                promise.reject("end_of_stream_failed", error.message, error)
            }
        }
    }

    override fun stopPlayback(promise: Promise) {
        moduleScope.launch {
            try {
                graph.stopPlayback()
                session.release(SessionReason.Playback)
                currentPlaybackProfile = null
                promise.resolve(null)
            } catch (error: Throwable) {
                promise.reject("stop_playback_failed", error.message, error)
            }
        }
    }

    override fun bufferedPlaybackDurationMs(promise: Promise) {
        moduleScope.launch {
            val duration = graph.bufferedDuration()
            promise.resolve(duration.toDouble(DurationUnit.MILLISECONDS))
        }
    }

    override fun setPlaybackVolume(volume: Double, promise: Promise) {
        moduleScope.launch {
            graph.setVolume(volume)
            promise.resolve(null)
        }
    }

    override fun setSpeakerEnabled(enabled: Boolean, promise: Promise) {
        moduleScope.launch {
            promise.resolve(session.setSpeakerEnabled(enabled))
        }
    }

    override fun openSystemSettings(promise: Promise) {
        val context = reactApplicationContext
        val opened = runCatching {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", context.packageName, null)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        }.isSuccess
        promise.resolve(opened)
    }

    override fun dispose(promise: Promise) {
        moduleScope.launch {
            try {
                graph.dispose()
                session.dispose()
                promise.resolve(null)
            } catch (error: Throwable) {
                promise.reject("dispose_failed", error.message, error)
            }
        }
    }

    override fun invalidate() {
        super.invalidate()
        session.dispose()
        runBlocking { graph.dispose() }
        moduleScope.cancel()
    }
}
