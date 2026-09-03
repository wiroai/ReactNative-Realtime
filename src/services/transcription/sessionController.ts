import { ModelDefinition } from '../../models/modelDefinition';
import { ModelParameterValues } from '../../models/modelParameterValues';
import { RealtimeSessionGuard } from '../../audio/sessionGuard';
import { TranscriptionSessionSnapshot } from './sessionSnapshot';

export interface TranscriptionSessionController {
  readonly snapshot: TranscriptionSessionSnapshot;
  readonly model: ModelDefinition;
  readonly parameters: ModelParameterValues;
  readonly sessionGuard: RealtimeSessionGuard;

  subscribe(
    listener: (snapshot: TranscriptionSessionSnapshot) => void,
  ): () => void;

  start(): Promise<void>;

  stop(): Promise<void>;

  setMuted(muted: boolean): void;

  setParameter(id: string, value: string): void;

  clearTranscript(): void;

  openSystemSettings(): Promise<void>;

  dispose(): Promise<void>;
}
