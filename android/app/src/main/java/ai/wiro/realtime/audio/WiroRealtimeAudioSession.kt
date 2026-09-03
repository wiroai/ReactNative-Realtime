package ai.wiro.realtime.audio

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/** Which profile a session mode maps to, ported from the Kotlin
 * reference's `RealtimeAudioProfile`. [Conversation] drives
 * [AudioManager.MODE_IN_COMMUNICATION] and call-style routing;
 * [Transcription] keeps [AudioManager.MODE_NORMAL] but still routes
 * like a call (headset/Bluetooth over speaker); [Speech] is plain
 * media playback with no call routing. */
enum class SessionProfile {
    Conversation,
    Transcription,
    Speech,
    ;

    val voiceCallRoute: Boolean
        get() = this != Speech
}

/** Why a caller is holding the session open — capture and playback
 * activate/release independently but share one [AudioManager]. */
enum class SessionReason {
    Capture,
    Playback,
}

enum class RealtimeAudioInterruption {
    Began,
    Ended,
}

data class RouteState(
    val hasWiredHeadset: Boolean,
    val hasBluetoothRoute: Boolean,
)

/**
 * Configures the shared [AudioManager] communication path and
 * publishes route / interruption events, ref-counted across capture
 * and playback so either side can be active without the other.
 *
 * Ported from Kotlin-Realtime's `AndroidRealtimeAudioSession`; the
 * permission and system-settings-link responsibilities stay on the
 * JS side (via `PermissionsAndroid` and `Linking`), since a
 * TurboModule has no `ComponentActivity` to attach a permission
 * request launcher to.
 */
class WiroRealtimeAudioSession(context: Context) {
    private val appContext = context.applicationContext
    private val audioManager = appContext.getSystemService(
        Context.AUDIO_SERVICE,
    ) as AudioManager

    private val lock = Any()
    private val activeReasons = mutableMapOf<SessionReason, SessionProfile>()
    private var receiversBound = false
    private var focusRequest: AudioFocusRequest? = null
    private var disposed = false

    private val interruptionEvents = MutableSharedFlow<RealtimeAudioInterruption>(
        extraBufferCapacity = 16,
    )
    private val noisyEvents = MutableSharedFlow<Unit>(extraBufferCapacity = 16)
    private val routeEvents = MutableSharedFlow<RouteState>(extraBufferCapacity = 16)

    val interruptions: Flow<RealtimeAudioInterruption>
        get() = interruptionEvents.asSharedFlow()

    val becomingNoisy: Flow<Unit>
        get() = noisyEvents.asSharedFlow()

    val routeChanges: Flow<RouteState>
        get() = routeEvents.asSharedFlow()

    private val noisyReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) {
                noisyEvents.tryEmit(Unit)
            }
        }
    }

    private val deviceCallback = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) {
            rerouteActive()
            routeEvents.tryEmit(currentRouteState())
        }

        override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) {
            rerouteActive()
            routeEvents.tryEmit(currentRouteState())
            noisyEvents.tryEmit(Unit)
        }
    }

    private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
        when (change) {
            AudioManager.AUDIOFOCUS_LOSS,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
            -> interruptionEvents.tryEmit(RealtimeAudioInterruption.Began)

            AudioManager.AUDIOFOCUS_GAIN ->
                interruptionEvents.tryEmit(RealtimeAudioInterruption.Ended)
        }
    }

    /** Activates the shared session for [reason] at [profile], or
     * re-routes it if another reason is already active. */
    fun activate(reason: SessionReason, profile: SessionProfile) {
        val wasEmpty: Boolean
        synchronized(lock) {
            if (disposed) {
                throw AudioFailure.Capture
            }
            wasEmpty = activeReasons.isEmpty()
            activeReasons[reason] = profile
        }
        if (wasEmpty) {
            bindReceivers()
            val request = buildFocusRequest(profile)
            val granted = audioManager.requestAudioFocus(request)
            if (granted != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
                synchronized(lock) { activeReasons.remove(reason) }
                throw AudioFailure.Capture
            }
            synchronized(lock) { focusRequest = request }
        }
        applyEffectiveState()
    }

    /** Releases [reason]'s hold on the session; tears everything down
     * once no reason remains active. */
    fun release(reason: SessionReason) {
        val stillActive: Boolean
        synchronized(lock) {
            activeReasons.remove(reason)
            stillActive = activeReasons.isNotEmpty()
        }
        if (stillActive) {
            applyEffectiveState()
            return
        }
        val request = synchronized(lock) { focusRequest.also { focusRequest = null } }
        CommunicationRoute.clear(audioManager)
        if (request != null) {
            audioManager.abandonAudioFocusRequest(request)
        }
        audioManager.mode = AudioManager.MODE_NORMAL
    }

    suspend fun setSpeakerEnabled(enabled: Boolean): Boolean = try {
        @Suppress("DEPRECATION")
        audioManager.isSpeakerphoneOn = enabled
        true
    } catch (_: Exception) {
        false
    }

    fun currentRouteState(): RouteState = RouteState(
        hasWiredHeadset = CommunicationRoute.hasWiredHeadset(audioManager),
        hasBluetoothRoute = CommunicationRoute.hasBluetoothRoute(audioManager),
    )

    fun dispose() {
        synchronized(lock) {
            if (disposed) {
                return
            }
            disposed = true
            activeReasons.clear()
        }
        val request = synchronized(lock) { focusRequest.also { focusRequest = null } }
        CommunicationRoute.clear(audioManager)
        if (request != null) {
            audioManager.abandonAudioFocusRequest(request)
        }
        audioManager.mode = AudioManager.MODE_NORMAL
        unbindReceivers()
    }

    private fun applyEffectiveState() {
        val profiles = synchronized(lock) { activeReasons.values.toList() }
        val mode = when {
            profiles.contains(SessionProfile.Conversation) -> AudioManager.MODE_IN_COMMUNICATION
            profiles.isNotEmpty() -> AudioManager.MODE_NORMAL
            else -> AudioManager.MODE_NORMAL
        }
        audioManager.mode = mode
        CommunicationRoute.apply(
            audioManager,
            voiceCall = profiles.any { it.voiceCallRoute },
        )
    }

    private fun rerouteActive() {
        val profiles = synchronized(lock) { activeReasons.values.toList() }
        if (profiles.isEmpty()) {
            return
        }
        CommunicationRoute.apply(
            audioManager,
            voiceCall = profiles.any { it.voiceCallRoute },
        )
    }

    private fun buildFocusRequest(profile: SessionProfile): AudioFocusRequest {
        val usage = if (profile == SessionProfile.Conversation) {
            AudioAttributes.USAGE_VOICE_COMMUNICATION
        } else {
            AudioAttributes.USAGE_MEDIA
        }
        val content = if (profile == SessionProfile.Conversation) {
            AudioAttributes.CONTENT_TYPE_SPEECH
        } else {
            AudioAttributes.CONTENT_TYPE_MUSIC
        }
        return AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(usage)
                    .setContentType(content)
                    .build(),
            )
            .setOnAudioFocusChangeListener(focusListener)
            .build()
    }

    private fun bindReceivers() {
        if (synchronized(lock) { receiversBound }) {
            return
        }
        appContext.registerReceiver(
            noisyReceiver,
            IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),
        )
        audioManager.registerAudioDeviceCallback(deviceCallback, null)
        synchronized(lock) { receiversBound = true }
    }

    private fun unbindReceivers() {
        if (!synchronized(lock) { receiversBound }) {
            return
        }
        runCatching { appContext.unregisterReceiver(noisyReceiver) }
        audioManager.unregisterAudioDeviceCallback(deviceCallback)
        synchronized(lock) { receiversBound = false }
    }
}
