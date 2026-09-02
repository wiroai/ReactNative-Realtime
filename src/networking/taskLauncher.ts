import { ModelDefinition } from '../models/modelDefinition';
import { WiroRunResult } from '../models/runResult';
import { WiroApiClient } from './apiClient';
import { WiroRequestCancellation } from './requestCancellation';

/**
 * Owns the Wiro Run task behind a realtime session: the in-flight
 * request, its cancellation, and the server-side task it produces.
 *
 * A task that outlives its caller keeps billing on the server, so
 * the two ways of letting go are deliberately separate: `release`
 * forgets a task that a clean session end already wound down, while
 * `terminateBestEffort` tells the server to tear it down.
 */
export class RealtimeTaskLauncher {
  private runResult: WiroRunResult | null = null;
  private cancellation: WiroRequestCancellation | null = null;

  constructor(private readonly apiClient: WiroApiClient) {}

  get currentRunResult(): WiroRunResult | null {
    return this.runResult;
  }

  /**
   * Creates the task, or returns null when `isStillWanted` reports
   * that the caller moved on while the request was in flight.
   */
  async launch(
    model: ModelDefinition,
    parameters: Readonly<Record<string, unknown>>,
    isStillWanted: () => boolean,
  ): Promise<WiroRunResult | null> {
    const cancellation = this.apiClient.createCancellation();
    this.cancellation = cancellation;
    const runResult = await this.apiClient.runModel(
      model,
      parameters,
      cancellation,
    );
    if (!isStillWanted()) {
      await this.apiClient.terminateTaskBestEffort(
        runResult.taskId,
        runResult.taskToken,
      );
      return null;
    }
    this.runResult = runResult;
    this.cancellation = null;
    return runResult;
  }

  cancelPendingRequest(): void {
    const cancellation = this.cancellation;
    this.cancellation = null;
    cancellation?.cancel();
  }

  release(): void {
    this.runResult = null;
  }

  async terminateBestEffort(): Promise<void> {
    const runResult = this.runResult;
    this.runResult = null;
    if (!runResult) {
      return;
    }
    await this.apiClient.terminateTaskBestEffort(
      runResult.taskId,
      runResult.taskToken,
    );
  }
}
