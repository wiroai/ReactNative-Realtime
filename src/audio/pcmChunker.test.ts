import { PcmChunker } from './pcmChunker';

describe('PcmChunker', () => {
  it('emits fixed chunks and keeps a remainder', () => {
    const chunker = new PcmChunker(4);

    const first = chunker.add(Uint8Array.from([1, 2, 3]));
    const second = chunker.add(Uint8Array.from([4, 5, 6, 7, 8, 9]));

    expect(first).toHaveLength(0);
    expect(second).toHaveLength(2);
    expect(second[0]).toEqual(Uint8Array.from([1, 2, 3, 4]));
    expect(second[1]).toEqual(Uint8Array.from([5, 6, 7, 8]));
    expect(chunker.remainderLength).toBe(1);
  });

  it('resets the remainder', () => {
    const chunker = new PcmChunker(4);
    chunker.add(Uint8Array.from([1, 2, 3]));

    chunker.reset();

    expect(chunker.remainderLength).toBe(0);
  });
});
