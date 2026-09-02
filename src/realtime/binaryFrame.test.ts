import { utf8ToBytes } from '@noble/hashes/utils.js';
import { RealtimeBinaryFrame } from './binaryFrame';

describe('RealtimeBinaryFrame', () => {
  it('encodes and decodes a token-prefixed PCM frame', () => {
    const payload = new Uint8Array([1, 2, 3]);
    const frame = RealtimeBinaryFrame.encode('task-token', payload);

    expect(frame).toEqual(
      new Uint8Array([...utf8ToBytes('task-token|'), 1, 2, 3]),
    );
    expect(RealtimeBinaryFrame.decodePayload('task-token', frame)).toEqual(
      payload,
    );
  });

  it('rejects a binary frame for another task token', () => {
    const frame = RealtimeBinaryFrame.encode(
      'other-token',
      new Uint8Array([1, 2, 3]),
    );

    expect(RealtimeBinaryFrame.decodePayload('task-token', frame)).toBeNull();
    expect(RealtimeBinaryFrame.separator).toBe('|'.charCodeAt(0));
  });
});
