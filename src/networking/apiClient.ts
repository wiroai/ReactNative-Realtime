import { WiroAuthHeaders } from '../auth';
import { ModelDefinition } from '../models/modelDefinition';
import { WiroRunResult } from '../models/runResult';
import { WiroEndpoints } from './endpoints';
import { WiroFailure } from './failure';
import { WiroHttpClient, WiroHttpResponse } from './httpClient';
import { WiroRequestCancellation } from './requestCancellation';

export interface WiroApiClient {
  createCancellation(): WiroRequestCancellation;

  runModel(
    model: ModelDefinition,
    parameters: Readonly<Record<string, unknown>>,
    cancellation: WiroRequestCancellation | null,
  ): Promise<WiroRunResult>;

  terminateTaskBestEffort(taskId: string, taskToken: string): Promise<void>;
}

export class DefaultWiroApiClient implements WiroApiClient {
  constructor(
    private readonly httpClient: WiroHttpClient,
    private readonly authHeaders: WiroAuthHeaders,
  ) {}

  createCancellation(): WiroRequestCancellation {
    return new WiroRequestCancellation();
  }

  async runModel(
    model: ModelDefinition,
    parameters: Readonly<Record<string, unknown>>,
    cancellation: WiroRequestCancellation | null,
  ): Promise<WiroRunResult> {
    const response = await this.httpClient.post(
      WiroEndpoints.runPath(model.owner, model.slug),
      this.authHeaders.create(),
      parameters,
      cancellation,
    );
    validateStatusCode(response.statusCode);
    const dto = parseRunResponse(response.json);
    if (!dto || dto.result === null || dto.errors === null) {
      throw WiroFailure.MalformedResponse;
    }
    if (!dto.result) {
      throw WiroFailure.ApiRejected;
    }
    const taskId = dto.taskId?.trim() ?? '';
    const taskToken = dto.taskToken?.trim() ?? '';
    if (dto.errors.length > 0 || taskId.length === 0 || taskToken.length === 0) {
      throw WiroFailure.MalformedResponse;
    }
    return { taskId, taskToken };
  }

  async terminateTaskBestEffort(
    taskId: string,
    taskToken: string,
  ): Promise<void> {
    try {
      const response = await this.httpClient.post(
        WiroEndpoints.TASK_CANCEL,
        this.authHeaders.create(),
        { taskid: taskId },
        null,
      );
      if (isSuccessfulTaskAction(response)) {
        return;
      }
    } catch {
      // The task may already be running; try Kill.
    }
    try {
      await this.httpClient.post(
        WiroEndpoints.TASK_KILL,
        this.authHeaders.create(),
        { socketaccesstoken: taskToken },
        null,
      );
    } catch {
      // Abnormal-shutdown termination is best effort.
    }
  }
}

interface WiroRunResponseDto {
  readonly result: boolean | null;
  readonly errors: readonly unknown[] | null;
  readonly taskId: string | null;
  readonly taskToken: string | null;
}

function parseRunResponse(
  json: Readonly<Record<string, unknown>> | null,
): WiroRunResponseDto | null {
  if (!json) {
    return null;
  }
  return {
    result: typeof json.result === 'boolean' ? json.result : null,
    errors: Array.isArray(json.errors) ? json.errors : null,
    taskId: typeof json.taskid === 'string' ? json.taskid : null,
    taskToken:
      typeof json.socketaccesstoken === 'string'
        ? json.socketaccesstoken
        : null,
  };
}

function isSuccessfulTaskAction(response: WiroHttpResponse): boolean {
  if (response.statusCode < 200 || response.statusCode > 299) {
    return false;
  }
  return response.json?.result === true;
}

function validateStatusCode(statusCode: number): void {
  if (statusCode >= 200 && statusCode < 300) {
    return;
  }
  if (statusCode === 401 || statusCode === 403) {
    throw WiroFailure.Authentication;
  }
  if (statusCode === 429) {
    throw WiroFailure.RateLimited;
  }
  throw WiroFailure.ServerUnavailable;
}
