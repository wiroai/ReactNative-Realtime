import { WiroCredentials, usesSignature } from './credentials';
import { WiroNonceGenerator, createMonotonicNonceGenerator } from './nonceGenerator';
import { createWiroRequestSignature } from './requestSigner';

export const API_KEY_HEADER = 'x-api-key';
export const NONCE_HEADER = 'x-nonce';
export const SIGNATURE_HEADER = 'x-signature';

export type WiroRequestSigner = (
  apiKey: string,
  apiSecret: string,
  nonce: string,
) => string;

export interface WiroAuthHeadersOptions {
  readonly credentials: WiroCredentials;
  readonly nonceGenerator?: WiroNonceGenerator;
  readonly signer?: WiroRequestSigner;
}

export class WiroAuthHeaders {
  private readonly credentials: WiroCredentials;
  private readonly nonceGenerator: WiroNonceGenerator;
  private readonly signer: WiroRequestSigner;

  constructor(options: WiroAuthHeadersOptions) {
    this.credentials = options.credentials;
    this.nonceGenerator =
      options.nonceGenerator ?? createMonotonicNonceGenerator();
    this.signer = options.signer ?? createWiroRequestSignature;
  }

  create(): Record<string, string> {
    const headers: Record<string, string> = {
      [API_KEY_HEADER]: this.credentials.apiKey,
    };
    const apiSecret = this.credentials.apiSecret;
    if (!usesSignature(this.credentials) || !apiSecret) {
      return headers;
    }
    const nonce = this.nonceGenerator();
    headers[NONCE_HEADER] = nonce;
    headers[SIGNATURE_HEADER] = this.signer(
      this.credentials.apiKey,
      apiSecret,
      nonce,
    );
    return headers;
  }
}
