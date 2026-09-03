/**
 * Invalidates in-flight realtime work whose result is no longer
 * wanted.
 *
 * Every asynchronous session operation claims an id through
 * `begin`. Code resuming after an `await` must re-check `isCurrent`
 * before touching shared state, because a newer operation — or
 * `dispose` — may have superseded it while the await was pending.
 */
export class RealtimeOperationGuard {
  private currentId = 0;
  private disposed = false;

  get current(): number {
    return this.currentId;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  begin(): number {
    this.currentId += 1;
    return this.currentId;
  }

  isCurrent(operationId: number): boolean {
    return !this.disposed && operationId === this.currentId;
  }

  dispose(): void {
    this.disposed = true;
    this.currentId += 1;
  }
}
