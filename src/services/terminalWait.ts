/** One-shot wait used while session-end confirmation is in flight. */
export class TerminalWait {
  private waiter: Promise<void> | null = null;
  private resolveWaiter: (() => void) | null = null;
  private completed = false;

  get isCompleted(): boolean {
    return this.completed;
  }

  wait(): Promise<void> {
    if (this.completed) {
      return Promise.resolve();
    }
    if (!this.waiter) {
      this.waiter = new Promise<void>(resolve => {
        this.resolveWaiter = resolve;
      });
    }
    return this.waiter;
  }

  complete(): void {
    if (this.completed) {
      return;
    }
    this.completed = true;
    this.resolveWaiter?.();
  }
}
