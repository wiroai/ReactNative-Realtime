export interface ConversationSuspensionOptions {
  readonly gracePeriodMs: number;
  readonly onExpired: () => void;
  readonly nowMillis?: () => number;
}

/**
 * Wall-clock hold for a conversation the speaker left the screen
 * of.
 *
 * The timer hangs the task up if nobody comes back. A frozen app
 * runs no timers, so `hasLapsed` is the source of truth on resume.
 */
export class ConversationSuspension {
  readonly gracePeriodMs: number;
  private readonly onExpired: () => void;
  private readonly nowMillis: () => number;

  private expireJob: ReturnType<typeof setTimeout> | null = null;
  private suspendedAt: number | null = null;
  private disposed = false;

  constructor(options: ConversationSuspensionOptions) {
    this.gracePeriodMs = options.gracePeriodMs;
    this.onExpired = options.onExpired;
    this.nowMillis = options.nowMillis ?? (() => Date.now());
  }

  /** A configured zero (or less) means leaving is hanging up. */
  get holdsAnything(): boolean {
    return this.gracePeriodMs > 0;
  }

  /**
   * True when no hold is running, or wall-clock time has passed the
   * grace period — even if the timer never fired.
   */
  get hasLapsed(): boolean {
    const started = this.suspendedAt;
    if (started === null) {
      return true;
    }
    return this.nowMillis() - started > this.gracePeriodMs;
  }

  begin(): void {
    if (this.disposed) {
      return;
    }
    if (this.expireJob !== null) {
      clearTimeout(this.expireJob);
    }
    this.suspendedAt = this.nowMillis();
    this.expireJob = setTimeout(() => this.expire(), this.gracePeriodMs);
  }

  /** Cancels the timer without forgetting when the hold started. */
  cancel(): void {
    if (this.expireJob !== null) {
      clearTimeout(this.expireJob);
      this.expireJob = null;
    }
  }

  /** Drops the hold entirely: the session is ending or coming back. */
  clear(): void {
    if (this.expireJob !== null) {
      clearTimeout(this.expireJob);
      this.expireJob = null;
    }
    this.suspendedAt = null;
  }

  dispose(): void {
    this.disposed = true;
    if (this.expireJob !== null) {
      clearTimeout(this.expireJob);
      this.expireJob = null;
    }
    this.suspendedAt = null;
  }

  private expire(): void {
    this.expireJob = null;
    if (!this.disposed) {
      this.onExpired();
    }
  }
}
