/**
 * Chunks an arbitrary PCM byte stream into fixed-size frames,
 * carrying a remainder across calls.
 */
export class PcmChunker {
  readonly chunkSizeInBytes: number;
  private remainder: Uint8Array = new Uint8Array(0);

  constructor(chunkSizeInBytes: number) {
    if (chunkSizeInBytes <= 0) {
      throw new Error('Chunk size must be positive.');
    }
    this.chunkSizeInBytes = chunkSizeInBytes;
  }

  get remainderLength(): number {
    return this.remainder.length;
  }

  add(bytes: Uint8Array): Uint8Array[] {
    if (bytes.length === 0) {
      return [];
    }
    const combined = new Uint8Array(this.remainder.length + bytes.length);
    combined.set(this.remainder, 0);
    combined.set(bytes, this.remainder.length);

    const chunks: Uint8Array[] = [];
    let offset = 0;
    while (combined.length - offset >= this.chunkSizeInBytes) {
      const end = offset + this.chunkSizeInBytes;
      chunks.push(combined.slice(offset, end));
      offset = end;
    }
    this.remainder = combined.slice(offset);
    return chunks;
  }

  reset(): void {
    this.remainder = new Uint8Array(0);
  }
}
