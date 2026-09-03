import { gptRealtimeMini } from '../../../models/catalog';
import { ModelDefinition } from '../../../models/modelDefinition';
import { ModelParameterValues } from '../../../models/modelParameterValues';
import { RealtimeSessionGuard } from '../../../audio/sessionGuard';
import { ConversationSessionController } from '../../../services/conversation/sessionController';
import {
  ConversationSessionSnapshot,
  initialConversationSessionSnapshot,
} from '../../../services/conversation/sessionSnapshot';
import { ConversationVoiceActivity } from '../../../services/conversation/voiceActivity';
import { conversationParameterValues } from '../../../app/conversationConfig';

/**
 * A screen-facing fake: it satisfies `ConversationSessionController`
 * with call counters instead of running any real session, so RNTL
 * tests can drive the stage pattern directly with `setSnapshot`.
 */
export class FakeConversationController implements ConversationSessionController {
  readonly model: ModelDefinition = gptRealtimeMini;
  readonly parameters: ModelParameterValues = conversationParameterValues();
  readonly sessionGuard = new RealtimeSessionGuard();
  readonly voiceActivity = new ConversationVoiceActivity();

  snapshot: ConversationSessionSnapshot = initialConversationSessionSnapshot;

  startCalls = 0;
  stopCalls = 0;
  suspendCalls = 0;
  resumeCalls = 0;
  interruptCalls = 0;
  openSystemSettingsCalls = 0;
  lastMuted: boolean | null = null;

  private listeners: Array<(snapshot: ConversationSessionSnapshot) => void> = [];

  subscribe(
    listener: (snapshot: ConversationSessionSnapshot) => void,
  ): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  async start(): Promise<void> {
    this.startCalls += 1;
  }

  async stop(): Promise<void> {
    this.stopCalls += 1;
  }

  async changeVoice(): Promise<void> {}

  async suspend(): Promise<void> {
    this.suspendCalls += 1;
  }

  async resume(): Promise<void> {
    this.resumeCalls += 1;
  }

  setMuted(muted: boolean): void {
    this.lastMuted = muted;
    this.setSnapshot({ ...this.snapshot, muted });
  }

  setParameter(): void {}

  interruptAssistant(): void {
    this.interruptCalls += 1;
  }

  async openSystemSettings(): Promise<void> {
    this.openSystemSettingsCalls += 1;
  }

  async dispose(): Promise<void> {}

  /** Test-only: publishes a snapshot the way the real service would. */
  setSnapshot(next: ConversationSessionSnapshot): void {
    this.snapshot = next;
    this.listeners.forEach(listener => listener(next));
  }
}
