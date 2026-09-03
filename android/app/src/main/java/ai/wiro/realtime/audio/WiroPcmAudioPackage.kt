package ai.wiro.realtime.audio

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/** Exposes [WiroPcmAudioModule] to the New Architecture module
 * registry. Registered manually in `MainApplication.kt` since this
 * TurboModule is app-local and not autolinked. */
class WiroPcmAudioPackage : BaseReactPackage() {
    override fun getModule(
        name: String,
        reactContext: ReactApplicationContext,
    ): NativeModule? = if (name == NativeWiroPcmAudioSpec.NAME) {
        WiroPcmAudioModule(reactContext)
    } else {
        null
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
        mapOf(
            NativeWiroPcmAudioSpec.NAME to ReactModuleInfo(
                NativeWiroPcmAudioSpec.NAME,
                NativeWiroPcmAudioSpec.NAME,
                false, // canOverrideExistingModule
                false, // needsEagerInit
                false, // isCxxModule
                true, // isTurboModule
            ),
        )
    }
}
