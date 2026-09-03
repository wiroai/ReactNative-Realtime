type DataResolve = (chunk: Uint8Array | null) => void;
type SpaceResolve = () => void;

/**
 * Bounded FIFO of PCM chunks with overflow shed and backpressure.
 *
 * `tryAdd` never waits — a full queue drops the chunk and records
 * it. `add` waits for space so a slower consumer can catch up.
 * `take` waits for data or a close. Close releases every waiter.
 *
 * JS has no threads to park, so waiting is modeled with pending
 * promises instead of Kotlin's `suspendCancellableCoroutine`; the
 * ordering guarantees are the same because a single-threaded event
 * loop never interleaves two synchronous sections.
 */
export class BoundedPcmQueue {
  readonly capacityInChunks: number;

  private buffer: Uint8Array[] = [];
  private dataWaiters: DataResolve[] = [];
  private spaceWaiters: SpaceResolve[] = [];
  private closed = false;
  private highWater = 0;
  private rejected = 0;

  constructor(capacityInChunks: number) {
    if (capacityInChunks <= 0) {
      throw new Error('Queue capacity must be positive.');
    }
    this.capacityInChunks = capacityInChunks;
  }

  get length(): number {
    return this.buffer.length;
  }

  get highWaterMarkInChunks(): number {
    return this.highWater;
  }

  get rejectedChunks(): number {
    return this.rejected;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  tryAdd(chunk: Uint8Array): boolean {
    if (chunk.length === 0) {
      return true;
    }
    if (this.closed || this.buffer.length >= this.capacityInChunks) {
      this.rejected += 1;
      return false;
    }
    this.enqueue(chunk);
    return true;
  }

  async add(chunk: Uint8Array): Promise<void> {
    if (chunk.length === 0) {
      return;
    }
    while (true) {
      if (this.closed) {
        return;
      }
      if (this.buffer.length < this.capacityInChunks) {
        this.enqueue(chunk);
        return;
      }
      await this.parkForSpace();
    }
  }

  take(): Promise<Uint8Array | null> {
    return new Promise(resolve => {
      if (this.buffer.length > 0) {
        const chunk = this.buffer.shift() as Uint8Array;
        resolve(chunk);
        this.releaseSpaceWaiters();
        return;
      }
      if (this.closed) {
        resolve(null);
        return;
      }
      this.dataWaiters.push(resolve);
    });
  }

  async *chunks(): AsyncGenerator<Uint8Array> {
    while (true) {
      const chunk = await this.take();
      if (chunk === null) {
        return;
      }
      yield chunk;
    }
  }

  clear(): void {
    this.buffer = [];
    this.releaseSpaceWaiters();
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    const dataWaiters = this.dataWaiters;
    this.dataWaiters = [];
    const spaceWaiters = this.spaceWaiters;
    this.spaceWaiters = [];
    dataWaiters.forEach(resolve => resolve(null));
    spaceWaiters.forEach(resolve => resolve());
  }

  private enqueue(chunk: Uint8Array): void {
    if (this.dataWaiters.length > 0) {
      if (this.highWater < 1) {
        this.highWater = 1;
      }
      const waiter = this.dataWaiters.shift() as DataResolve;
      waiter(chunk.slice());
      return;
    }
    this.buffer.push(chunk.slice());
    if (this.buffer.length > this.highWater) {
      this.highWater = this.buffer.length;
    }
  }

  private releaseSpaceWaiters(): void {
    const waiters = this.spaceWaiters;
    this.spaceWaiters = [];
    waiters.forEach(resolve => resolve());
  }

  private parkForSpace(): Promise<void> {
    return new Promise(resolve => {
      if (this.closed || this.buffer.length < this.capacityInChunks) {
        resolve();
        return;
      }
      this.spaceWaiters.push(resolve);
    });
  }
}
