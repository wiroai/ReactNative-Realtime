import { BoundedPcmQueue } from './boundedPcmQueue';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(() => resolve(), ms));
}

describe('BoundedPcmQueue', () => {
  it('preserves FIFO order', async () => {
    const queue = new BoundedPcmQueue(2);
    await queue.add(Uint8Array.from([1]));
    await queue.add(Uint8Array.from([2]));

    expect(await queue.take()).toEqual(Uint8Array.from([1]));
    expect(await queue.take()).toEqual(Uint8Array.from([2]));
  });

  it('applies producer backpressure', async () => {
    const queue = new BoundedPcmQueue(1);
    await queue.add(Uint8Array.from([1]));
    let added = false;
    const secondAdd = queue.add(Uint8Array.from([2])).then(() => {
      added = true;
    });
    await delay(20);
    expect(added).toBe(false);

    expect(await queue.take()).toEqual(Uint8Array.from([1]));
    await secondAdd;
    expect(added).toBe(true);
    expect(await queue.take()).toEqual(Uint8Array.from([2]));
  });

  it('sheds overflow and tracks metrics', () => {
    const queue = new BoundedPcmQueue(1);

    expect(queue.tryAdd(Uint8Array.from([1]))).toBe(true);
    expect(queue.tryAdd(Uint8Array.from([2]))).toBe(false);

    expect(queue.highWaterMarkInChunks).toBe(1);
    expect(queue.rejectedChunks).toBe(1);
    expect(queue.length).toBe(1);
  });

  it('releases pending consumers on close', async () => {
    const queue = new BoundedPcmQueue(1);
    const pending = queue.take();
    queue.close();

    expect(await pending).toBeNull();
    expect(queue.isClosed).toBe(true);
  });

  it('rejects a non-positive capacity', () => {
    expect(() => new BoundedPcmQueue(0)).toThrow();
  });

  it('treats an empty chunk as a no-op', async () => {
    const queue = new BoundedPcmQueue(1);

    expect(queue.tryAdd(new Uint8Array(0))).toBe(true);
    await queue.add(new Uint8Array(0));

    expect(queue.length).toBe(0);
  });
});
