export interface WiroCredentials {
  readonly apiKey: string;
  readonly apiSecret?: string;
}

export function usesSignature(credentials: WiroCredentials): boolean {
  return Boolean(credentials.apiSecret && credentials.apiSecret.length > 0);
}
