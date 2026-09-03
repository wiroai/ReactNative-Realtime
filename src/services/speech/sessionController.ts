import { ModelDefinition } from '../../models/modelDefinition';
import { ModelParameterValues } from '../../models/modelParameterValues';
import { RealtimeSessionGuard } from '../../audio/sessionGuard';
import { SpeechSessionSnapshot } from './sessionSnapshot';

export interface SpeechSessionController {
  readonly snapshot: SpeechSessionSnapshot;
  readonly parameters: ModelParameterValues;
  readonly sessionGuard: RealtimeSessionGuard;
  prompt: string;

  subscribe(
    listener: (snapshot: SpeechSessionSnapshot) => void,
  ): () => void;

  selectModel(model: ModelDefinition): void;

  setParameter(id: string, value: string): void;

  start(): Promise<void>;

  stop(): Promise<void>;

  dispose(): Promise<void>;
}
