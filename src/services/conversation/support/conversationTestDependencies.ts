import { ConversationConfig } from '../../../app/conversationConfig';
import { AudioConstants } from '../../../audio/audioConstants';
import { AudioPreparationResult } from '../../../audio/realtimeAudioSession';
import { FakePcmAudioPlayer } from '../../../audio/support/fakePcmAudioPlayer';
import { FakePcmAudioRecorder } from '../../../audio/support/fakePcmAudioRecorder';
import { FakeRealtimeAudioSession } from '../../../audio/support/fakeRealtimeAudioSession';
import { RealtimeSessionGuard } from '../../../audio/sessionGuard';
import { FakeWiroApiClient } from '../../../networking/support/fakeWiroApiClient';
import { FakeRealtimeSessionClient } from '../../../realtime/support/fakeRealtimeSessionClient';
import {
  SpeechToSpeechSessionService,
  SpeechToSpeechSessionServiceOptions,
} from '../speechToSpeechSessionService';

export interface ConversationTestDependenciesOptions {
  readonly preparationResult?: AudioPreparationResult;
  readonly runErrors?: readonly unknown[];
}

export interface CreateConversationServiceOptions {
  readonly maxRetryAttempts?: number;
  readonly retryBaseDelayMs?: number;
  readonly micStallTimeoutMs?: number;
  readonly autoRestartDelayMs?: number;
  readonly maxAutoRestarts?: number;
  readonly maxSessionDurationMs?: number;
  readonly suspendGracePeriodMs?: number;
  readonly parameterOverrides?: Readonly<Record<string, string>>;
}

/**
 * Test-only wiring for `SpeechToSpeechSessionService`: every fake
 * the service depends on, plus a factory that fills in the
 * production defaults a test does not care about.
 */
export class ConversationTestDependencies {
  readonly audioSession: FakeRealtimeAudioSession;
  readonly apiClient: FakeWiroApiClient;
  readonly recorder = new FakePcmAudioRecorder();
  readonly player = new FakePcmAudioPlayer();
  readonly session = new FakeRealtimeSessionClient();
  readonly sessionGuard = new RealtimeSessionGuard();
  readonly taskTokens: string[] = [];

  constructor(options: ConversationTestDependenciesOptions = {}) {
    this.audioSession = new FakeRealtimeAudioSession();
    this.audioSession.prepareResult =
      options.preparationResult ?? AudioPreparationResult.Ready;
    this.apiClient = new FakeWiroApiClient();
    this.apiClient.nextRunResult = { taskId: 'task-id', taskToken: 'task-token' };
    this.apiClient.runErrors.push(...(options.runErrors ?? []));
  }

  createService(
    options: CreateConversationServiceOptions = {},
  ): SpeechToSpeechSessionService {
    const serviceOptions: SpeechToSpeechSessionServiceOptions = {
      audioSession: this.audioSession,
      apiClient: this.apiClient,
      sessionFactory: (_taskId, taskToken) => {
        this.taskTokens.push(taskToken);
        return this.session;
      },
      recorder: this.recorder,
      player: this.player,
      sessionGuard: this.sessionGuard,
      parameterOverrides: options.parameterOverrides ?? ConversationConfig.parameters,
      maxSessionDurationMs: options.maxSessionDurationMs ?? 0,
      suspendGracePeriodMs:
        options.suspendGracePeriodMs ?? ConversationConfig.suspendGracePeriodMs,
      terminalTimeoutMs: 0,
      maxRetryAttempts: options.maxRetryAttempts ?? 0,
      retryBaseDelayMs: options.retryBaseDelayMs ?? 0,
      micStallTimeoutMs: options.micStallTimeoutMs ?? 3_000,
      autoRestartDelayMs: options.autoRestartDelayMs ?? 5_000,
      maxAutoRestarts: options.maxAutoRestarts ?? 2,
    };
    return new SpeechToSpeechSessionService(serviceOptions);
  }
}

export function conversationPcm(
  amplitude: number,
  durationMs: number = 20,
): Uint8Array {
  const sampleCount = Math.round(
    (AudioConstants.SAMPLE_RATE_HZ * durationMs) / 1_000,
  );
  const bytes = new Uint8Array(sampleCount * AudioConstants.BYTES_PER_SAMPLE);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < sampleCount; index += 1) {
    view.setInt16(index * 2, amplitude, true);
  }
  return bytes;
}
