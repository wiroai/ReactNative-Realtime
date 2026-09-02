import { ModelDefinition } from '../../models/modelDefinition';
import { WiroRunResult } from '../../models/runResult';
import { WiroApiClient } from '../apiClient';
import { WiroRequestCancellation } from '../requestCancellation';

export class FakeWiroApiClient implements WiroApiClient {
  runCalls = 0;
  lastModel: ModelDefinition | null = null;
  lastParameters: Readonly<Record<string, unknown>> | null = null;
  lastCancellation: WiroRequestCancellation | null = null;
  readonly terminatedTaskIds: string[] = [];
  terminateCalls = 0;
  readonly runErrors: unknown[] = [];
  holdRunModel = false;
  nextRunResult: WiroRunResult = { taskId: 'task-1', taskToken: 'token-1' };
  isWaiting = false;

  private release: (() => void) | null = null;

  completeRunModel(): void {
    const release = this.release;
    this.release = null;
    this.isWaiting = false;
    release?.();
  }

  async waitUntilHolding(attempts = 100): Promise<void> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (this.isWaiting) {
        return;
      }
      await delay(10);
    }
  }

  createCancellation(): WiroRequestCancellation {
    const cancellation = new WiroRequestCancellation();
    this.lastCancellation = cancellation;
    return cancellation;
  }

  async runModel(
    model: ModelDefinition,
    parameters: Readonly<Record<string, unknown>>,
  ): Promise<WiroRunResult> {
    this.runCalls += 1;
    this.lastModel = model;
    this.lastParameters = parameters;
    if (this.runErrors.length > 0) {
      throw this.runErrors.shift();
    }
    if (this.holdRunModel) {
      await new Promise<void>(resolve => {
        this.release = resolve;
        this.isWaiting = true;
      });
    }
    return this.nextRunResult;
  }

  async terminateTaskBestEffort(taskId: string): Promise<void> {
    this.terminateCalls += 1;
    this.terminatedTaskIds.push(taskId);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(() => resolve(), ms));
}
