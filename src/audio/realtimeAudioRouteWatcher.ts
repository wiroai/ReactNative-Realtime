import {
  RealtimeAudioInterruption,
  RealtimeAudioSession,
  Unsubscribe,
} from './realtimeAudioSession';

export interface RealtimeAudioRouteWatcherOptions {
  readonly audioSession: RealtimeAudioSession;
  readonly onShouldStop: () => void;
  readonly onRouteChanged: () => void;
  readonly onPlaybackFailure?: (failure: unknown) => void;
  readonly addPlaybackFailureListener?: (
    listener: (failure: unknown) => void,
  ) => void;
}

/**
 * Owns the audio subscriptions that can force a realtime session to
 * end, and reports them as intent rather than raw platform events.
 *
 * An interruption and an unplugged output mean the same thing to a
 * caller — stop now — so they collapse into `onShouldStop`. Whether
 * the session can act on that stays with the caller.
 */
export class RealtimeAudioRouteWatcher {
  private readonly unsubscribers: Unsubscribe[];

  constructor(options: RealtimeAudioRouteWatcherOptions) {
    this.unsubscribers = [
      options.audioSession.onInterruption(interruption => {
        if (interruption === RealtimeAudioInterruption.Began) {
          options.onShouldStop();
        }
      }),
      options.audioSession.onBecomingNoisy(() => options.onShouldStop()),
      options.audioSession.onRouteChanged(() => options.onRouteChanged()),
    ];
    if (options.addPlaybackFailureListener && options.onPlaybackFailure) {
      const onPlaybackFailure = options.onPlaybackFailure;
      options.addPlaybackFailureListener(failure => onPlaybackFailure(failure));
    }
  }

  dispose(): void {
    this.unsubscribers.forEach(unsubscribe => unsubscribe());
    this.unsubscribers.length = 0;
  }
}
