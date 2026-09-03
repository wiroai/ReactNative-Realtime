import type { AppStateStatus } from 'react-native';

export interface AppLifecycleControllers {
  suspendConversation(): void;
  stopTranscription(): void;
  stopSpeech(): void;
  resumeConversation(): void;
}

/**
 * Tracks `AppState` transitions and decides what to do about the
 * three sessions — ported from `EndSessionsWhenBackgrounded.kt` /
 * the Swift `scenePhase` handlers.
 *
 * Only `background` (the `ON_STOP` equivalent) hangs sessions up;
 * the transient `inactive` state RN also reports on iOS (Control
 * Center, the app switcher) is left alone. Only Conversation
 * resumes automatically on return, and only when its tab is the
 * one currently on screen — Transcription and Speech wait for an
 * explicit tap on Start.
 */
export class AppLifecycleTracker {
  private previousState: AppStateStatus;

  constructor(initialState: AppStateStatus) {
    this.previousState = initialState;
  }

  onStateChange(
    nextState: AppStateStatus,
    controllers: AppLifecycleControllers,
    isConversationVisible: () => boolean,
  ): void {
    const previous = this.previousState;
    this.previousState = nextState;

    if (nextState === 'background' && previous !== 'background') {
      controllers.suspendConversation();
      controllers.stopTranscription();
      controllers.stopSpeech();
      return;
    }

    if (nextState === 'active' && previous === 'background' && isConversationVisible()) {
      controllers.resumeConversation();
    }
  }
}
