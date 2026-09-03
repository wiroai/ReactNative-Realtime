import {
  AudioPreparationResult,
  RealtimeAudioInterruption,
  RealtimeAudioProfile,
  RealtimeAudioSession,
  Unsubscribe,
} from '../realtimeAudioSession';

export class FakeRealtimeAudioSession implements RealtimeAudioSession {
  prepareResult: AudioPreparationResult = AudioPreparationResult.Ready;
  speakerEnabledResult = true;
  systemSettingsResult = true;

  prepareCalls = 0;
  deactivateCalls = 0;
  disposeCalls = 0;
  readonly preparedProfiles: RealtimeAudioProfile[] = [];

  private readonly interruptionListeners: Array<
    (interruption: RealtimeAudioInterruption) => void
  > = [];
  private readonly becomingNoisyListeners: Array<() => void> = [];
  private readonly routeChangedListeners: Array<() => void> = [];

  onInterruption(
    listener: (interruption: RealtimeAudioInterruption) => void,
  ): Unsubscribe {
    this.interruptionListeners.push(listener);
    return () => {
      const index = this.interruptionListeners.indexOf(listener);
      if (index !== -1) {
        this.interruptionListeners.splice(index, 1);
      }
    };
  }

  onBecomingNoisy(listener: () => void): Unsubscribe {
    this.becomingNoisyListeners.push(listener);
    return () => {
      const index = this.becomingNoisyListeners.indexOf(listener);
      if (index !== -1) {
        this.becomingNoisyListeners.splice(index, 1);
      }
    };
  }

  onRouteChanged(listener: () => void): Unsubscribe {
    this.routeChangedListeners.push(listener);
    return () => {
      const index = this.routeChangedListeners.indexOf(listener);
      if (index !== -1) {
        this.routeChangedListeners.splice(index, 1);
      }
    };
  }

  async prepare(profile: RealtimeAudioProfile): Promise<AudioPreparationResult> {
    this.prepareCalls += 1;
    this.preparedProfiles.push(profile);
    return this.prepareResult;
  }

  async deactivate(): Promise<void> {
    this.deactivateCalls += 1;
  }

  async setSpeakerEnabled(): Promise<boolean> {
    return this.speakerEnabledResult;
  }

  async openSystemSettings(): Promise<boolean> {
    return this.systemSettingsResult;
  }

  async dispose(): Promise<void> {
    this.disposeCalls += 1;
  }

  emitInterruption(interruption: RealtimeAudioInterruption): void {
    this.interruptionListeners.forEach(listener => listener(interruption));
  }

  emitBecomingNoisy(): void {
    this.becomingNoisyListeners.forEach(listener => listener());
  }

  emitRouteChanged(): void {
    this.routeChangedListeners.forEach(listener => listener());
  }
}
