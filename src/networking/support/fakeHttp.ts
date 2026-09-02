import { WiroHttpClient, WiroHttpResponse } from '../httpClient';
import { WiroRequestCancellation } from '../requestCancellation';

export class FakeHttp implements WiroHttpClient {
  path: string | null = null;
  headers: Readonly<Record<string, string>> | null = null;
  body: Readonly<Record<string, unknown>> | null = null;
  cancellation: WiroRequestCancellation | null = null;
  readonly paths: string[] = [];

  constructor(public response: WiroHttpResponse) {}

  async post(
    path: string,
    headers: Readonly<Record<string, string>>,
    body: Readonly<Record<string, unknown>>,
    cancellation: WiroRequestCancellation | null,
  ): Promise<WiroHttpResponse> {
    this.paths.push(path);
    this.path = path;
    this.headers = headers;
    this.body = body;
    this.cancellation = cancellation;
    return this.response;
  }

  close(): void {}
}
