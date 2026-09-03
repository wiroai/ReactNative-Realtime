import { AudioFailure } from '../../audio/audioFailure';
import { WiroFailure, WiroFailureCode } from '../../networking/failure';

const DEFAULT_MAX_RETRY_ATTEMPTS = 5;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;
const DEFAULT_AUTO_RESTART_DELAY_MS = 5_000;
const DEFAULT_MAX_AUTO_RESTARTS = 2;

export interface ConversationRecoveryPolicyOptions {
  readonly maxRetryAttempts?: number;
  readonly retryBaseDelayMs?: number;
  readonly autoRestartDelayMs?: number;
  readonly maxAutoRestarts?: number;
}

/**
 * Retry and auto-restart budgets for a conversation that lost its
 * task.
 *
 * A healthy microphone chunk reaching the server is the only signal
 * that both counters should refill.
 */
export class ConversationRecoveryPolicy {
  readonly maxRetryAttempts: number;
  readonly retryBaseDelayMs: number;
  readonly autoRestartDelayMs: number;
  readonly maxAutoRestarts: number;

  private autoRestartJob: ReturnType<typeof setTimeout> | null = null;
  private retryAttemptValue = 0;
  private autoRestartCycle = 0;
  private disposed = false;

  constructor(options: ConversationRecoveryPolicyOptions = {}) {
    this.maxRetryAttempts = options.maxRetryAttempts ?? DEFAULT_MAX_RETRY_ATTEMPTS;
    this.retryBaseDelayMs =
      options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
    this.autoRestartDelayMs =
      options.autoRestartDelayMs ?? DEFAULT_AUTO_RESTART_DELAY_MS;
    this.maxAutoRestarts = options.maxAutoRestarts ?? DEFAULT_MAX_AUTO_RESTARTS;
  }

  get retryAttempt(): number {
    return this.retryAttemptValue;
  }

  /**
   * Backoff after the current retry was scheduled: doubles each
   * time.
   */
  get nextRetryDelayMs(): number {
    const shift = Math.max(0, this.retryAttemptValue - 1);
    return this.retryBaseDelayMs * 2 ** shift;
  }

  shouldRetry(error: unknown, isReconfiguring: boolean): boolean {
    if (isReconfiguring || this.retryAttemptValue >= this.maxRetryAttempts) {
      return false;
    }
    return this.isRecoverable(error);
  }

  isRecoverable(error: unknown): boolean {
    if (error instanceof AudioFailure) {
      return true;
    }
    if (!(error instanceof WiroFailure)) {
      return false;
    }
    switch (error.code) {
      case WiroFailureCode.ServerUnavailable:
      case WiroFailureCode.NetworkUnavailable:
      case WiroFailureCode.RequestTimeout:
      case WiroFailureCode.SocketConnection:
      case WiroFailureCode.SocketConnectTimeout:
      case WiroFailureCode.StreamReadyTimeout:
        return true;
      case WiroFailureCode.Authentication:
      case WiroFailureCode.ApiRejected:
      case WiroFailureCode.RateLimited:
      case WiroFailureCode.Cancelled:
      case WiroFailureCode.MalformedResponse:
      case WiroFailureCode.RealtimeProtocol:
      case WiroFailureCode.SessionBusy:
        return false;
    }
  }

  noteRetryScheduled(): void {
    this.retryAttemptValue += 1;
  }

  /** A microphone chunk reached the server, so both budgets refill. */
  noteHealthy(): void {
    this.retryAttemptValue = 0;
    this.autoRestartCycle = 0;
  }

  /** A user (or auto-restart) start; in-flight retries reset. */
  resetRetries(): void {
    this.retryAttemptValue = 0;
  }

  /** Arms a restart. Returns false when the budget is spent. */
  scheduleAutoRestart(restart: () => void): boolean {
    if (this.disposed || this.autoRestartCycle >= this.maxAutoRestarts) {
      return false;
    }
    if (this.autoRestartJob !== null) {
      clearTimeout(this.autoRestartJob);
    }
    const shift = this.autoRestartCycle > 2 ? 2 : this.autoRestartCycle;
    this.autoRestartCycle += 1;
    const wait = this.autoRestartDelayMs * 2 ** shift;
    this.autoRestartJob = setTimeout(() => {
      if (!this.disposed) {
        restart();
      }
    }, wait);
    return true;
  }

  cancelAutoRestart(): void {
    if (this.autoRestartJob !== null) {
      clearTimeout(this.autoRestartJob);
      this.autoRestartJob = null;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.cancelAutoRestart();
  }
}
