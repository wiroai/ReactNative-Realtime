import { FetchWiroHttpClient } from './fetchHttpClient';
import { WiroFailure } from './failure';
import { WiroRequestCancellation } from './requestCancellation';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

function setGlobalFetch(mock: jest.Mock): void {
  (globalThis as unknown as { fetch: typeof fetch }).fetch =
    mock as unknown as typeof fetch;
}

describe('FetchWiroHttpClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts JSON and parses a run envelope', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        jsonResponse({
          result: true,
          errors: [],
          taskid: '9',
          socketaccesstoken: 'tok',
        }),
      );
    setGlobalFetch(fetchMock);

    const client = new FetchWiroHttpClient('https://example.test/v1');
    const response = await client.post(
      '/Run/openai/gpt',
      { 'x-api-key': 'test-key' },
      { voice: 'marin' },
      null,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/v1/Run/openai/gpt',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-api-key': 'test-key' }),
      }),
    );
    expect(response.statusCode).toBe(200);
    expect(response.json?.result).toBe(true);
    expect(response.json?.socketaccesstoken).toBe('tok');
    client.close();
  });

  it('does not hit the network when cancelled before send', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({}));
    setGlobalFetch(fetchMock);

    const client = new FetchWiroHttpClient();
    const cancellation = new WiroRequestCancellation();
    cancellation.cancel();

    await expect(
      client.post('/Run/openai/gpt', {}, {}, cancellation),
    ).rejects.toBe(WiroFailure.Cancelled);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
