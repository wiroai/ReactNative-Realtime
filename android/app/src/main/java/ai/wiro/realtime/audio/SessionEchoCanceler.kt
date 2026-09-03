package ai.wiro.realtime.audio

import android.media.audiofx.AcousticEchoCanceler

/**
 * Binds an [AcousticEchoCanceler] to a capture session when the
 * device exposes one.
 *
 * Voice-communication capture already asks the HAL for AEC, but
 * some devices only cancel echo after the effect is attached to
 * this session id. A missing effect must not block capture.
 */
internal class SessionEchoCanceler(
    private val isAvailable: () -> Boolean,
    private val create: (Int) -> CancellableEffect?,
) {
    fun interface CancellableEffect {
        fun release()
    }

    private var effect: CancellableEffect? = null

    val isAttached: Boolean
        get() = effect != null

    fun attach(audioSessionId: Int) {
        release()
        if (!isAvailable()) {
            return
        }
        effect = create(audioSessionId)
    }

    fun release() {
        effect?.release()
        effect = null
    }

    companion object {
        fun platform(): SessionEchoCanceler = SessionEchoCanceler(
            isAvailable = AcousticEchoCanceler::isAvailable,
            create = fun(sessionId: Int): CancellableEffect? {
                val created = AcousticEchoCanceler.create(sessionId)
                    ?: return null
                val enabled = runCatching {
                    created.enabled = true
                }.isSuccess
                if (!enabled) {
                    created.release()
                    return null
                }
                return CancellableEffect { created.release() }
            },
        )
    }
}
