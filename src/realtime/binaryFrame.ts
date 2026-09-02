import { utf8ToBytes } from '@noble/hashes/utils.js';
import { WiroRealtimeProtocol } from './protocol';

const SEPARATOR = WiroRealtimeProtocol.BINARY_PREFIX_SEPARATOR.charCodeAt(0);

export const RealtimeBinaryFrame = {
  separator: SEPARATOR,

  encode(taskToken: string, payload: Uint8Array): Uint8Array {
    const prefix = utf8ToBytes(taskToken);
    const frame = new Uint8Array(prefix.length + 1 + payload.length);
    frame.set(prefix, 0);
    frame[prefix.length] = SEPARATOR;
    frame.set(payload, prefix.length + 1);
    return frame;
  },

  decodePayload(taskToken: string, frame: Uint8Array): Uint8Array | null {
    const tokenBytes = utf8ToBytes(taskToken);
    const payloadOffset = tokenBytes.length + 1;
    if (frame.length < payloadOffset) {
      return null;
    }
    if (frame[tokenBytes.length] !== SEPARATOR) {
      return null;
    }
    for (let i = 0; i < tokenBytes.length; i += 1) {
      if (frame[i] !== tokenBytes[i]) {
        return null;
      }
    }
    return frame.subarray(payloadOffset);
  },
};
