#import "WiroPcmAudioModule.h"

// The generated `-Swift.h` umbrella below re-declares every @objc
// type in the module, including AppDelegate.swift's
// ReactNativeDelegate; that requires this header to already be
// visible even though this file never touches it directly.
#import <React_RCTAppDelegate/RCTDefaultReactNativeFactoryDelegate.h>
#import "WiroRealtime-Swift.h"

@interface WiroPcmAudioModule ()
@property (nonatomic, strong) WiroPcmAudioModuleImpl *impl;
@end

@implementation WiroPcmAudioModule

RCT_EXPORT_MODULE(WiroPcmAudio)

- (instancetype)init
{
  if (self = [super init]) {
    _impl = [[WiroPcmAudioModuleImpl alloc] init];

    __weak __typeof(self) weakSelf = self;

    _impl.onPcmChunk = ^(NSString *chunkBase64) {
      [weakSelf emitOnPcmChunk:@{@"chunkBase64" : chunkBase64}];
    };
    _impl.onCaptureFailure = ^(NSString *message) {
      [weakSelf emitOnCaptureFailure:@{@"message" : message}];
    };
    _impl.onCaptureDone = ^{
      [weakSelf emitOnCaptureDone];
    };
    _impl.onPlaybackFailure = ^(NSString *message) {
      [weakSelf emitOnPlaybackFailure:@{@"message" : message}];
    };
    _impl.onUnderrun = ^(NSString *profile) {
      [weakSelf emitOnUnderrun:@{@"profile" : profile}];
    };
    _impl.onRouteChanged = ^(BOOL hasWiredHeadset, BOOL hasBluetoothRoute) {
      [weakSelf emitOnRouteChanged:@{
        @"hasWiredHeadset" : @(hasWiredHeadset),
        @"hasBluetoothRoute" : @(hasBluetoothRoute),
      }];
    };
    _impl.onInterruption = ^(BOOL began) {
      [weakSelf emitOnInterruption:@{@"began" : @(began)}];
    };
    _impl.onBecomingNoisy = ^{
      [weakSelf emitOnBecomingNoisy];
    };
  }
  return self;
}

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (void)checkMicrophonePermission:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self.impl checkMicrophonePermissionWithResolve:resolve reject:reject];
}

- (void)requestMicrophonePermission:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self.impl requestMicrophonePermissionWithResolve:resolve reject:reject];
}

- (void)startCapture:(NSString *)profile
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject
{
  [self.impl startCaptureWithProfile:profile resolve:resolve reject:reject];
}

- (void)stopCapture:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self.impl stopCaptureWithResolve:resolve reject:reject];
}

- (void)setCaptureMuted:(BOOL)muted
{
  [self.impl setCaptureMuted:muted];
}

- (void)openPlayback:(NSString *)profile
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject
{
  [self.impl openPlaybackWithProfile:profile resolve:resolve reject:reject];
}

- (void)feedPlayback:(NSString *)chunkBase64
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject
{
  [self.impl feedPlaybackWithChunkBase64:chunkBase64 resolve:resolve reject:reject];
}

- (void)flushPlayback:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self.impl flushPlaybackWithResolve:resolve reject:reject];
}

- (void)endOfStreamPlayback:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self.impl endOfStreamPlaybackWithResolve:resolve reject:reject];
}

- (void)stopPlayback:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self.impl stopPlaybackWithResolve:resolve reject:reject];
}

- (void)bufferedPlaybackDurationMs:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self.impl bufferedPlaybackDurationMsWithResolve:resolve reject:reject];
}

- (void)setPlaybackVolume:(double)volume
                  resolve:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject
{
  [self.impl setPlaybackVolume:volume resolve:resolve reject:reject];
}

- (void)setSpeakerEnabled:(BOOL)enabled
                  resolve:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject
{
  [self.impl setSpeakerEnabled:enabled resolve:resolve reject:reject];
}

- (void)openSystemSettings:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self.impl openSystemSettingsWithResolve:resolve reject:reject];
}

- (void)dispose:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self.impl disposeWithResolve:resolve reject:reject];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeWiroPcmAudioSpecJSI>(params);
}

@end
