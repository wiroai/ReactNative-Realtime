import { RealtimeSessionGuard } from '../../../audio/sessionGuard';
import { voxtralMiniRealtime } from '../../../models/catalog';
import { ModelDefinition } from '../../../models/modelDefinition';
import { ModelParameterValues } from '../../../models/modelParameterValues';
import { TranscriptionSessionController } from '../../../services/transcription/sessionController';
import {
  TranscriptionSessionSnapshot,
  initialTranscriptionSessionSnapshot,
} from '../../../services/transcription/sessionSnapshot';

/** Screen-facing fake for `TranscriptionSessionController`. */
export class FakeTranscriptionController implements TranscriptionSessionController {
  readonly model: ModelDefinition = voxtralMiniRealtime;
  readonly parameters: ModelParameterValues = ModelParameterValues.create({
    fields: voxtralMiniRealtime.fields,
  });
  readonly sessionGuard = new RealtimeSessionGuard();

  snapshot: TranscriptionSessionSnapshot = initialTranscriptionSessionSnapshot;

  startCalls = 0;
  stopCalls = 0;
  clearCalls = 0;
  openSystemSettingsCalls = 0;
  lastMuted: boolean | null = null;

  private listeners: Array<(snapshot: TranscriptionSessionSnapshot) => void> = [];

  subscribe(
    listener: (snapshot: TranscriptionSessionSnapshot) => void,
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

  setMuted(muted: boolean): void {
    this.lastMuted = muted;
    this.setSnapshot({ ...this.snapshot, muted });
  }

  setParameter(): void {}

  clearTranscript(): void {
    this.clearCalls += 1;
    this.setSnapshot({ ...this.snapshot, transcript: '' });
  }

  async openSystemSettings(): Promise<void> {
    this.openSystemSettingsCalls += 1;
  }

  async dispose(): Promise<void> {}

  setSnapshot(next: TranscriptionSessionSnapshot): void {
    this.snapshot = next;
    this.listeners.forEach(listener => listener(next));
  }
}
