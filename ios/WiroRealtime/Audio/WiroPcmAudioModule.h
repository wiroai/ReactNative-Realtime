#import "WiroPcmAudioSpec/WiroPcmAudioSpec.h"

NS_ASSUME_NONNULL_BEGIN

/// Thin Objective-C++ TurboModule shim. All real logic lives in the
/// Swift `WiroPcmAudioModuleImpl` (see `WiroPcmAudioModuleImpl.swift`)
/// — this class only forwards codegen's protocol methods to it and
/// forwards its event closures back through the codegen `emitOnX`
/// helpers, since `NativeWiroPcmAudioSpecBase` carries a protected
/// C++ ivar that Swift cannot subclass directly.
@interface WiroPcmAudioModule : NativeWiroPcmAudioSpecBase <NativeWiroPcmAudioSpec>

@end

NS_ASSUME_NONNULL_END
