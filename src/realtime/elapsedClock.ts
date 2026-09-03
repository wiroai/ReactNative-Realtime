const DEFAULT_TICK_MS = 1_000;

/**
 * Reports how long a realtime session has been running on a fixed
 * cadence.
 *
 * `start` replaces any previous run, so a restarted session cannot
 * leave an orphaned timer behind.
 */
export class SessionElapsedClock {
  private readonly tickMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(tickMs: number = DEFAULT_TICK_MS) {
    this.tickMs = tickMs;
  }

  get isRunning(): boolean {
    return this.timer !== null;
  }

  start(onTick: (elapsedMs: number) => void): void {
    this.stop();
    let count = 0;
    this.timer = setInterval(() => {
      count += 1;
      onTick(this.tickMs * count);
    }, this.tickMs);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
