package ai.wiro.realtime.audio

enum class AudioFailureCode {
    CaptureUnavailable,
    PlaybackUnavailable,
}

data class AudioFailure(
    val code: AudioFailureCode,
    override val message: String,
) : Exception(message) {
    override fun toString(): String = message

    companion object {
        val Capture = AudioFailure(
            code = AudioFailureCode.CaptureUnavailable,
            message = "Microphone capture could not be started.",
        )
        val Playback = AudioFailure(
            code = AudioFailureCode.PlaybackUnavailable,
            message = "Audio playback could not be started.",
        )
    }
}
