import { WiroEndpoints } from './endpoints';
import { WiroFailure } from './failure';
import { WiroHttpClient, WiroHttpResponse } from './httpClient';
import { WiroRequestCancellation } from './requestCancellation';

const RUN_TIMEOUT_MS = 120_000;
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * `fetch`-based `WiroHttpClient`, ported from `KtorWiroHttpClient`.
 *
 * There is no client to own here, so `close` is a no-op kept for
 * interface parity with the Kotlin/Swift siblings.
 */
export class FetchWiroHttpClient implements WiroHttpClient {
  constructor(private readonly baseUrl: string = WiroEndpoints.REST_BASE) {}

  async post(
    path: string,
    headers: Readonly<Record<string, string>>,
    body: Readonly<Record<string, unknown>>,
    cancellation: WiroRequestCancellation | null,
  ): Promise<WiroHttpResponse> {
    if (cancellation?.isCancelled) {
      throw WiroFailure.Cancelled;
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMillis(path));
    cancellation?.onCancelled(() => controller.abort());

    try {
      const response = await fetch(this.baseUrl + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      return {
        statusCode: response.status,
        json: parseJsonObject(text),
      };
    } catch {
      if (cancellation?.isCancelled) {
        throw WiroFailure.Cancelled;
      }
      if (timedOut) {
        throw WiroFailure.RequestTimeout;
      }
      throw WiroFailure.NetworkUnavailable;
    } finally {
      clearTimeout(timer);
    }
  }

  close(): void {}
}

function timeoutMillis(path: string): number {
  return path.startsWith('/Run/') ? RUN_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  if (!text.trim()) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}
