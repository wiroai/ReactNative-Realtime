import { ModelDefinition } from '../../models/modelDefinition';
import { ModelParameterValues } from '../../models/modelParameterValues';
import { RealtimeSessionGuard } from '../../audio/sessionGuard';
import { ConversationSessionSnapshot } from './sessionSnapshot';
import { ConversationVoiceActivity } from './voiceActivity';

/**
 * Commands a two-way speech conversation and reports it as
 * snapshots.
 *
 * The view depends on this contract rather than on
 * `SpeechToSpeechSessionService` so it can be exercised without
 * audio hardware or a network stack.
 *
 * Every command is a no-op once `dispose` has run.
 */
export interface ConversationSessionController {
  readonly snapshot: ConversationSessionSnapshot;
  readonly model: ModelDefinition;
  readonly parameters: ModelParameterValues;
  readonly sessionGuard: RealtimeSessionGuard;
  readonly voiceActivity: ConversationVoiceActivity;

  subscribe(
    listener: (snapshot: ConversationSessionSnapshot) => void,
  ): () => void;

  start(): Promise<void>;

  stop(): Promise<void>;

  changeVoice(voice: string): Promise<void>;

  suspend(): Promise<void>;

  resume(): Promise<void>;

  setMuted(muted: boolean): void;

  setParameter(id: string, value: string): void;

  interruptAssistant(): void;

  openSystemSettings(): Promise<void>;

  dispose(): Promise<void>;
}
