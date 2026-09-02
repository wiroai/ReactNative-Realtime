/**
 * A cooperative cancellation token for one in-flight request.
 *
 * JS has no coroutine cancellation to hook into, so callers that
 * need to react to cancellation register a listener with
 * `onCancelled` instead of awaiting a signal.
 */
export class WiroRequestCancellation {
  private cancelled = false;
  private listeners: Array<() => void> = [];

  get isCancelled(): boolean {
    return this.cancelled;
  }

  cancel(): void {
    if (this.cancelled) {
      return;
    }
    this.cancelled = true;
    const listeners = this.listeners;
    this.listeners = [];
    listeners.forEach(listener => listener());
  }

  onCancelled(listener: () => void): void {
    if (this.cancelled) {
      listener();
      return;
    }
    this.listeners.push(listener);
  }
}
