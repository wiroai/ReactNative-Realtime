import { AudioPreparationResult } from '../../../audio/realtimeAudioSession';
import { FakePcmAudioRecorder } from '../../../audio/support/fakePcmAudioRecorder';
import { FakeRealtimeAudioSession } from '../../../audio/support/fakeRealtimeAudioSession';
import { RealtimeSessionGuard } from '../../../audio/sessionGuard';
import { FakeWiroApiClient } from '../../../networking/support/fakeWiroApiClient';
import {
  SpeechToTextSessionService,
  SpeechToTextSessionServiceOptions,
} from '../speechToTextSessionService';
import { FakeTranscriptionSession } from './fakeTranscriptionSession';

export interface TranscriptionTestDependenciesOptions {
  readonly preparationResult?: AudioPreparationResult;
  readonly completeSessionEnd?: boolean;
}

/**
 * Test-only wiring for `SpeechToTextSessionService`: every fake the
 * service depends on, plus a factory that fills in the production
 * defaults a test does not care about.
 */
export class TranscriptionTestDependencies {
  readonly audioSession: FakeRealtimeAudioSession;
  readonly apiClient = new FakeWiroApiClient();
  readonly recorder = new FakePcmAudioRecorder();
  readonly session: FakeTranscriptionSession;
  readonly sessionGuard = new RealtimeSessionGuard();

  constructor(options: TranscriptionTestDependenciesOptions = {}) {
    this.audioSession = new FakeRealtimeAudioSession();
    this.audioSession.prepareResult =
      options.preparationResult ?? AudioPreparationResult.Ready;
    this.apiClient.nextRunResult = { taskId: 'task-id', taskToken: 'task-token' };
    this.session = new FakeTranscriptionSession(options.completeSessionEnd ?? true);
  }

  createService(
    overrides: Partial<SpeechToTextSessionServiceOptions> = {},
  ): SpeechToTextSessionService {
    return new SpeechToTextSessionService({
      audioSession: this.audioSession,
      apiClient: this.apiClient,
      sessionFactory: () => this.session,
      recorder: this.recorder,
      sessionGuard: this.sessionGuard,
      terminalTimeoutMs: 0,
      ...overrides,
    });
  }
}
