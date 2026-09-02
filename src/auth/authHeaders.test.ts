import {
  API_KEY_HEADER,
  NONCE_HEADER,
  SIGNATURE_HEADER,
  WiroAuthHeaders,
} from './authHeaders';
import { createMonotonicNonceGenerator } from './nonceGenerator';
import { createWiroRequestSignature } from './requestSigner';

describe('WiroAuthHeaders', () => {
  it('creates api-key-only headers when there is no secret', () => {
    const headers = new WiroAuthHeaders({
      credentials: { apiKey: 'test-key' },
    }).create();

    expect(headers).toEqual({ [API_KEY_HEADER]: 'test-key' });
  });

  it('creates deterministic signature headers', () => {
    const headers = new WiroAuthHeaders({
      credentials: { apiKey: 'test-key', apiSecret: 'test-secret' },
      nonceGenerator: () => '1700000000',
    }).create();

    expect(headers[API_KEY_HEADER]).toBe('test-key');
    expect(headers[NONCE_HEADER]).toBe('1700000000');
    expect(headers[SIGNATURE_HEADER]).toBe(
      '0e8b719d1c158c40c2b10415f96c09b794780274f5f9cbaa48d2e723ac07fc3c',
    );
  });
});

describe('createMonotonicNonceGenerator', () => {
  it('produces a fresh nonce when timestamps are equal', () => {
    const nonce = createMonotonicNonceGenerator(() => 42);

    expect(nonce()).toBe('42');
    expect(nonce()).toBe('43');
  });
});

describe('createWiroRequestSignature', () => {
  it('emits lowercase hexadecimal output', () => {
    const signature = createWiroRequestSignature(
      'test-key',
      'test-secret',
      '1700000000',
    );

    expect(signature).toBe(signature.toLowerCase());
    expect(signature).toHaveLength(64);
    expect(signature).toMatch(/^[0-9a-f]+$/);
  });
});
