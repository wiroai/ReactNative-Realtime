import { AudioPreparationResult } from '../../../audio/realtimeAudioSession';
import { FakePcmAudioPlayer } from '../../../audio/support/fakePcmAudioPlayer';
import { FakeRealtimeAudioSession } from '../../../audio/support/fakeRealtimeAudioSession';
import { RealtimeSessionGuard } from '../../../audio/sessionGuard';
import { ModelDefinition } from '../../../models/modelDefinition';
import { mossTtsRealtime } from '../../../models/catalog';
import { FakeWiroApiClient } from '../../../networking/support/fakeWiroApiClient';
import {
  TextToSpeechSessionService,
  TextToSpeechSessionServiceOptions,
} from '../textToSpeechSessionService';
import { FakeSpeechSession } from './fakeSpeechSession';

export interface SpeechTestDependenciesOptions {
  readonly preparationResult?: AudioPreparationResult;
  readonly completeSessionEnd?: boolean;
  readonly holdComplete?: boolean;
  readonly sessionConnectFailures?: number;
}

/**
 * Test-only wiring for `TextToSpeechSessionService`: every fake the
 * service depends on, plus a factory that fills in the production
 * defaults a test does not care about.
 */
export class SpeechTestDependencies {
  readonly audioSession: FakeRealtimeAudioSession;
  readonly apiClient = new FakeWiroApiClient();
  readonly player: FakePcmAudioPlayer;
  readonly session: FakeSpeechSession;
  readonly sessionGuard = new RealtimeSessionGuard();

  constructor(options: SpeechTestDependenciesOptions = {}) {
    this.audioSession = new FakeRealtimeAudioSession();
    this.audioSession.prepareResult =
      options.preparationResult ?? AudioPreparationResult.Ready;
    this.apiClient.nextRunResult = { taskId: 'task-id', taskToken: 'task-token' };
    this.player = new FakePcmAudioPlayer({ holdComplete: options.holdComplete });
    this.session = new FakeSpeechSession(
      options.completeSessionEnd ?? true,
      options.sessionConnectFailures ?? 0,
    );
  }

  createService(
    model: ModelDefinition = mossTtsRealtime,
    overrides: Partial<TextToSpeechSessionServiceOptions> = {},
  ): TextToSpeechSessionService {
    return new TextToSpeechSessionService({
      audioSession: this.audioSession,
      apiClient: this.apiClient,
      sessionFactory: () => this.session,
      player: this.player,
      sessionGuard: this.sessionGuard,
      model,
      terminalTimeoutMs: 0,
      connectRetryDelayMs: 0,
      ...overrides,
    });
  }
}
