import { WiroAuthHeaders, API_KEY_HEADER } from '../auth';
import { gptRealtimeMini } from '../models/catalog';
import { modelSlug } from '../models/modelDefinition';
import { DefaultWiroApiClient } from './apiClient';
import { WiroFailure, WiroFailureCode } from './failure';
import { WiroRequestCancellation } from './requestCancellation';
import { FakeHttp } from './support/fakeHttp';

function makeClient(httpClient: FakeHttp): DefaultWiroApiClient {
  return new DefaultWiroApiClient(
    httpClient,
    new WiroAuthHeaders({ credentials: { apiKey: 'api-key' } }),
  );
}

describe('DefaultWiroApiClient', () => {
  it('returns typed task identifiers from a run response', async () => {
    const httpClient = new FakeHttp({
      statusCode: 200,
      json: {
        result: true,
        errors: [],
        taskid: '2221',
        socketaccesstoken: 'task-token',
      },
    });
    const client = makeClient(httpClient);
    const cancellation = new WiroRequestCancellation();

    const result = await client.runModel(
      gptRealtimeMini,
      { voice: 'alloy' },
      cancellation,
    );

    expect(result).toEqual({ taskId: '2221', taskToken: 'task-token' });
    expect(httpClient.path).toBe('/Run/openai/gpt-realtime-mini');
    expect(httpClient.body?.voice).toBe('alloy');
    expect(httpClient.cancellation).toBe(cancellation);
    expect(httpClient.headers).toEqual({ [API_KEY_HEADER]: 'api-key' });
  });

  it('rejects malformed successful responses', async () => {
    const client = makeClient(
      new FakeHttp({
        statusCode: 200,
        json: { result: true, errors: [], taskid: '2221' },
      }),
    );

    await expect(
      client.runModel(gptRealtimeMini, {}, null),
    ).rejects.toBe(WiroFailure.MalformedResponse);
  });

  it('redacts credentials and server errors from failures', async () => {
    const apiKey = 'private-api-key';
    const apiSecret = 'private-api-secret';
    const client = new DefaultWiroApiClient(
      new FakeHttp({
        statusCode: 200,
        json: {
          result: false,
          errors: [{ message: `Rejected ${apiKey} and ${apiSecret}` }],
          taskid: null,
          socketaccesstoken: null,
        },
      }),
      new WiroAuthHeaders({ credentials: { apiKey, apiSecret } }),
    );

    let failure: WiroFailure | undefined;
    try {
      await client.runModel(gptRealtimeMini, {}, null);
    } catch (error) {
      failure = error as WiroFailure;
    }

    const text = String(failure);
    expect(text).not.toContain(apiKey);
    expect(text).not.toContain(apiSecret);
    expect(text).not.toContain('Rejected');
    expect(failure).toBe(WiroFailure.ApiRejected);
  });

  it('maps unauthorized responses to an authentication failure', async () => {
    const client = makeClient(
      new FakeHttp({
        statusCode: 401,
        json: { result: false, errors: [] },
      }),
    );

    await expect(
      client.runModel(gptRealtimeMini, {}, null),
    ).rejects.toBe(WiroFailure.Authentication);
  });

  it('does not call Kill after a successful Task Cancel', async () => {
    const httpClient = new FakeHttp({
      statusCode: 200,
      json: { result: true },
    });
    const client = makeClient(httpClient);

    await client.terminateTaskBestEffort('task-id', 'task-token');

    expect(httpClient.paths).toEqual(['/Task/Cancel']);
    expect(httpClient.body?.taskid).toBe('task-id');
  });

  it('falls back from Task Cancel to Task Kill', async () => {
    const httpClient = new FakeHttp({
      statusCode: 409,
      json: { result: false },
    });
    const client = makeClient(httpClient);

    await client.terminateTaskBestEffort('task-id', 'task-token');

    expect(httpClient.paths).toEqual(['/Task/Cancel', '/Task/Kill']);
    expect(httpClient.body?.socketaccesstoken).toBe('task-token');
  });

  it('exposes a stable machine-readable code on a failure', () => {
    const failure = WiroFailure.SessionBusy;
    expect(failure.code).toBe(WiroFailureCode.SessionBusy);
    expect(Object.keys(failure.diagnostics)).toHaveLength(0);
  });

  it('uses the canonical owner/slug from the model catalog', () => {
    expect(modelSlug(gptRealtimeMini)).toBe('openai/gpt-realtime-mini');
  });
});
