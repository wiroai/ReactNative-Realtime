package ai.wiro.realtime.audio

import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build

/**
 * Headset first, then the loudspeaker.
 *
 * [AudioManager.MODE_IN_COMMUNICATION] otherwise plays from the
 * earpiece, which is wrong for a speaker facing a phone. A wired
 * or SCO headset still wins, matching the Swift `allowBluetooth` +
 * `defaultToSpeaker` combination.
 */
internal object CommunicationRoute {
    enum class Output {
        WiredHeadset,
        BluetoothSco,
        Speaker,
    }

    fun choose(
        hasWiredHeadset: Boolean,
        hasBluetoothSco: Boolean,
    ): Output = when {
        hasWiredHeadset -> Output.WiredHeadset
        hasBluetoothSco -> Output.BluetoothSco
        else -> Output.Speaker
    }

    fun apply(
        audioManager: AudioManager,
        voiceCall: Boolean,
    ) {
        if (!voiceCall) {
            clear(audioManager)
            return
        }
        route(
            audioManager,
            choose(
                hasWiredHeadset = hasWired(audioManager),
                hasBluetoothSco = hasBluetooth(audioManager),
            ),
        )
    }

    fun clear(audioManager: AudioManager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            audioManager.clearCommunicationDevice()
        }
        stopSco(audioManager)
        @Suppress("DEPRECATION")
        audioManager.isSpeakerphoneOn = false
    }

    fun hasWiredHeadset(audioManager: AudioManager): Boolean = hasWired(audioManager)

    fun hasBluetoothRoute(audioManager: AudioManager): Boolean = hasBluetooth(audioManager)

    private fun route(
        audioManager: AudioManager,
        output: Output,
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val target = audioManager.availableCommunicationDevices
                .firstOrNull { device -> matches(device, output) }
            if (target != null) {
                val accepted = runCatching {
                    audioManager.setCommunicationDevice(target)
                }.getOrDefault(false)
                if (accepted) {
                    return
                }
            }
            if (output != Output.Speaker) {
                return
            }
        }
        applyLegacy(audioManager, output)
    }

    private fun applyLegacy(
        audioManager: AudioManager,
        output: Output,
    ) {
        when (output) {
            Output.WiredHeadset -> {
                stopSco(audioManager)
                @Suppress("DEPRECATION")
                audioManager.isSpeakerphoneOn = false
            }

            Output.BluetoothSco -> {
                @Suppress("DEPRECATION")
                audioManager.isSpeakerphoneOn = false
                startSco(audioManager)
            }

            Output.Speaker -> {
                stopSco(audioManager)
                @Suppress("DEPRECATION")
                audioManager.isSpeakerphoneOn = true
            }
        }
    }

    private fun hasWired(audioManager: AudioManager): Boolean = outputs(audioManager).any(::isWired)

    private fun hasBluetooth(audioManager: AudioManager): Boolean = outputs(audioManager).any(::isBluetooth)

    private fun outputs(
        audioManager: AudioManager,
    ): Array<AudioDeviceInfo> = audioManager.getDevices(
        AudioManager.GET_DEVICES_OUTPUTS,
    )

    private fun matches(
        device: AudioDeviceInfo,
        output: Output,
    ): Boolean = when (output) {
        Output.WiredHeadset -> isWired(device)

        Output.BluetoothSco -> isBluetooth(device)

        Output.Speaker ->
            device.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
    }

    private fun isWired(device: AudioDeviceInfo): Boolean = device.type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
        device.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
        device.type == AudioDeviceInfo.TYPE_USB_HEADSET

    private fun isBluetooth(device: AudioDeviceInfo): Boolean = device.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
        device.type == AudioDeviceInfo.TYPE_BLE_HEADSET

    private fun startSco(audioManager: AudioManager) {
        runCatching {
            @Suppress("DEPRECATION")
            audioManager.startBluetoothSco()
            @Suppress("DEPRECATION")
            audioManager.isBluetoothScoOn = true
        }
    }

    private fun stopSco(audioManager: AudioManager) {
        runCatching {
            @Suppress("DEPRECATION")
            if (audioManager.isBluetoothScoOn) {
                audioManager.stopBluetoothSco()
                audioManager.isBluetoothScoOn = false
            }
        }
    }
}
