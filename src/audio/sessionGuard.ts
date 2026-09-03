export enum RealtimeSessionOwner {
  Conversation = 'Conversation',
  Transcription = 'Transcription',
  Speech = 'Speech',
}

export interface RealtimeSessionLease {
  readonly owner: RealtimeSessionOwner;
  readonly id: number;
}

interface Waiter {
  readonly owner: RealtimeSessionOwner;
  readonly resolve: (lease: RealtimeSessionLease | null) => void;
  timer?: ReturnType<typeof setTimeout>;
}

const DEFAULT_ACQUIRE_TIMEOUT_MS = 5_000;

/**
 * The microphone and the realtime socket are one shared resource:
 * conversation, transcription, and speech must never hold both at
 * once. A lease is the only proof of ownership; only its holder can
 * release it, so a stale reference from an already-released screen
 * cannot steal back the guard.
 */
export class RealtimeSessionGuard {
  private lease: RealtimeSessionLease | null = null;
  private nextId = 0;
  private disposed = false;
  private waiters: Waiter[] = [];

  get currentLease(): RealtimeSessionLease | null {
    return this.lease;
  }

  acquire(owner: RealtimeSessionOwner): RealtimeSessionLease | null {
    if (this.disposed || this.lease !== null) {
      return null;
    }
    this.nextId += 1;
    const created: RealtimeSessionLease = { owner, id: this.nextId };
    this.lease = created;
    return created;
  }

  async acquireWhenFree(
    owner: RealtimeSessionOwner,
    timeoutMs: number = DEFAULT_ACQUIRE_TIMEOUT_MS,
  ): Promise<RealtimeSessionLease | null> {
    const immediate = this.acquire(owner);
    if (immediate) {
      return immediate;
    }
    if (this.disposed) {
      return null;
    }
    return new Promise<RealtimeSessionLease | null>(resolve => {
      const waiter: Waiter = { owner, resolve };
      waiter.timer = setTimeout(() => this.finish(waiter, null), timeoutMs);
      this.waiters.push(waiter);
    });
  }

  release(lease: RealtimeSessionLease | null): void {
    if (this.disposed || lease === null || this.lease !== lease) {
      return;
    }
    this.lease = null;
    this.fulfillNextWaiter();
  }

  dispose(): void {
    this.disposed = true;
    const waiters = this.waiters;
    this.waiters = [];
    waiters.forEach(waiter => {
      if (waiter.timer) {
        clearTimeout(waiter.timer);
      }
      waiter.resolve(null);
    });
  }

  private finish(waiter: Waiter, lease: RealtimeSessionLease | null): void {
    const index = this.waiters.indexOf(waiter);
    if (index === -1) {
      return;
    }
    this.waiters.splice(index, 1);
    if (waiter.timer) {
      clearTimeout(waiter.timer);
    }
    waiter.resolve(lease);
  }

  private fulfillNextWaiter(): void {
    const waiter = this.waiters[0];
    if (!waiter) {
      return;
    }
    const acquired = this.acquire(waiter.owner);
    if (acquired) {
      this.finish(waiter, acquired);
    }
  }
}
