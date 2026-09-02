import { WiroRequestCancellation } from './requestCancellation';

export interface WiroHttpResponse {
  readonly statusCode: number;
  readonly json: Readonly<Record<string, unknown>> | null;
}

export interface WiroHttpClient {
  post(
    path: string,
    headers: Readonly<Record<string, string>>,
    body: Readonly<Record<string, unknown>>,
    cancellation: WiroRequestCancellation | null,
  ): Promise<WiroHttpResponse>;

  close(): void;
}
