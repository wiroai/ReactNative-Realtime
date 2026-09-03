import { decodeBase64, encodeBase64 } from './base64';

function asciiBytes(text: string): Uint8Array {
  return Uint8Array.from(text, char => char.charCodeAt(0));
}

describe('base64', () => {
  it('round-trips arbitrary byte lengths', () => {
    for (let length = 0; length < 8; length += 1) {
      const bytes = new Uint8Array(length).map((_, index) => (index * 37) % 256);
      expect(decodeBase64(encodeBase64(bytes))).toEqual(bytes);
    }
  });

  it('matches a known vector', () => {
    const bytes = asciiBytes('Wiro realtime');
    expect(encodeBase64(bytes)).toBe('V2lybyByZWFsdGltZQ==');
    expect(decodeBase64('V2lybyByZWFsdGltZQ==')).toEqual(bytes);
  });

  it('decodes without padding', () => {
    expect(decodeBase64('V2lybw')).toEqual(asciiBytes('Wiro'));
  });
});
