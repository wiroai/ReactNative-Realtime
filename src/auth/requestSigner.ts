import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

/**
 * HMAC-SHA256 as lowercase hex.
 *
 * `HMAC-SHA256(key = UTF8(apiKey), message = UTF8(apiSecret + nonce))`.
 */
export function createWiroRequestSignature(
  apiKey: string,
  apiSecret: string,
  nonce: string,
): string {
  const digest = hmac(
    sha256,
    utf8ToBytes(apiKey),
    utf8ToBytes(apiSecret + nonce),
  );
  return bytesToHex(digest);
}
