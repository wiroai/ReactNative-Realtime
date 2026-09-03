const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const DECODE_TABLE: Readonly<Record<string, number>> = Object.fromEntries(
  ALPHABET.split('').map((char, index) => [char, index]),
);

/**
 * Plain-JS base64 codec for the PCM chunks crossing the TurboModule
 * bridge — see `specs/NativeWiroPcmAudio.ts` for why chunks travel
 * as base64 text rather than `ArrayBuffer`.
 *
 * Hermes does not ship `atob`/`btoa`, so this avoids depending on
 * either.
 */
/* eslint-disable no-bitwise -- base64 packs three bytes into 24
   bits; there is no non-bitwise way to express that. */
export function encodeBase64(bytes: Uint8Array): string {
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const byte0 = bytes[index];
    const byte1 = bytes[index + 1];
    const byte2 = bytes[index + 2];
    const chunk = (byte0 << 16) | ((byte1 ?? 0) << 8) | (byte2 ?? 0);
    result += ALPHABET[(chunk >> 18) & 0x3f];
    result += ALPHABET[(chunk >> 12) & 0x3f];
    result += byte1 === undefined ? '=' : ALPHABET[(chunk >> 6) & 0x3f];
    result += byte2 === undefined ? '=' : ALPHABET[chunk & 0x3f];
  }
  return result;
}

export function decodeBase64(base64: string): Uint8Array {
  const clean = base64.replace(/[=]+$/u, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let outputIndex = 0;
  let buffer = 0;
  let bitsCollected = 0;
  for (let index = 0; index < clean.length; index += 1) {
    const value = DECODE_TABLE[clean[index]];
    if (value === undefined) {
      continue;
    }
    buffer = (buffer << 6) | value;
    bitsCollected += 6;
    if (bitsCollected >= 8) {
      bitsCollected -= 8;
      bytes[outputIndex] = (buffer >> bitsCollected) & 0xff;
      outputIndex += 1;
    }
  }
  return bytes.subarray(0, outputIndex);
}
/* eslint-enable no-bitwise */
