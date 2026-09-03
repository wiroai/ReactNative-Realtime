import { RealtimeSessionGuard } from '../../../audio/sessionGuard';
import { mossTtsRealtime } from '../../../models/catalog';
import { ModelDefinition } from '../../../models/modelDefinition';
import { ModelParameterValues } from '../../../models/modelParameterValues';
import { SpeechSessionController } from '../../../services/speech/sessionController';
import {
  SpeechSessionSnapshot,
  initialSpeechSessionSnapshot,
} from '../../../services/speech/sessionSnapshot';

/** Screen-facing fake for `SpeechSessionController`. */
export class FakeSpeechController implements SpeechSessionController {
  readonly parameters: ModelParameterValues = ModelParameterValues.create({
    fields: mossTtsRealtime.fields,
  });
  readonly sessionGuard = new RealtimeSessionGuard();

  prompt = '';
  snapshot: SpeechSessionSnapshot = initialSpeechSessionSnapshot(mossTtsRealtime);

  startCalls = 0;
  stopCalls = 0;
  lastSelectedModel: ModelDefinition | null = null;

  private listeners: Array<(snapshot: SpeechSessionSnapshot) => void> = [];

  subscribe(listener: (snapshot: SpeechSessionSnapshot) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  selectModel(model: ModelDefinition): void {
    this.lastSelectedModel = model;
    this.setSnapshot({ ...this.snapshot, selectedModel: model });
  }

  setParameter(): void {}

  async start(): Promise<void> {
    this.startCalls += 1;
  }

  async stop(): Promise<void> {
    this.stopCalls += 1;
  }

  async dispose(): Promise<void> {}

  setSnapshot(next: SpeechSessionSnapshot): void {
    this.snapshot = next;
    this.listeners.forEach(listener => listener(next));
  }
}
