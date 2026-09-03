import { ConversationPlaybackCoordinator } from './playbackCoordinator';
import { ConversationVoiceActivity } from './voiceActivity';

const DEFAULT_HOLD_TIMEOUT_MS = 900;
const DEFAULT_HOLD_COOLDOWN_MS = 1_500;

export interface ConversationBargeInOptions {
  readonly playback: ConversationPlaybackCoordinator;
  readonly voiceActivity: ConversationVoiceActivity;
  readonly onProtocolEvent: (event: string) => void;
  readonly holdTimeoutMs?: number;
  readonly holdCooldownMs?: number;
  readonly nowMillis?: () => number;
}

/**
 * Two-stage barge-in: a loud moment silences the assistant while
 * keeping its audio; only input that sustains like speech commits
 * the cut, while a noise burst hands the audio back from where it
 * stopped.
 */
export class ConversationBargeIn {
  private readonly playback: ConversationPlaybackCoordinator;
  private readonly voiceActivity: ConversationVoiceActivity;
  private readonly onProtocolEvent: (event: string) => void;
  private readonly holdTimeoutMs: number;
  private readonly holdCooldownMs: number;
  private readonly nowMillis: () => number;

  private holdJob: ReturnType<typeof setTimeout> | null = null;
  private holdSuppressedUntil = 0;
  private disposed = false;

  constructor(options: ConversationBargeInOptions) {
    this.playback = options.playback;
    this.voiceActivity = options.voiceActivity;
    this.onProtocolEvent = options.onProtocolEvent;
    this.holdTimeoutMs = options.holdTimeoutMs ?? DEFAULT_HOLD_TIMEOUT_MS;
    this.holdCooldownMs = options.holdCooldownMs ?? DEFAULT_HOLD_COOLDOWN_MS;
    this.nowMillis = options.nowMillis ?? (() => Date.now());
  }

  /** Called by the service after every microphone chunk it accepted. */
  evaluate(): void {
    if (this.disposed) {
      return;
    }
    if (this.playback.isHolding) {
      if (this.voiceActivity.userInterrupting) {
        this.commitInterruption();
      } else if (!this.voiceActivity.hasInterruptEvidence) {
        this.resumeHeldTurn();
      }
      return;
    }
    if (this.voiceActivity.userInterrupting) {
      this.commitInterruption();
      return;
    }
    if (
      this.voiceActivity.userMaybeInterrupting &&
      this.nowMillis() >= this.holdSuppressedUntil &&
      this.playback.holdTurn()
    ) {
      this.onProtocolEvent('assistant_playback_held');
      this.startHoldDeadline();
    }
  }

  cancelHold(): void {
    this.cancelHoldInternal();
  }

  dispose(): void {
    this.disposed = true;
    this.cancelHoldInternal();
  }

  private commitInterruption(): void {
    if (!this.playback.interruptTurn()) {
      return;
    }
    this.cancelHoldInternal();
    this.voiceActivity.resetAi();
    this.onProtocolEvent('assistant_interrupted');
  }

  private resumeHeldTurn(): void {
    this.cancelHoldInternal();
    const resumed = this.playback.resumeHeldTurn();
    this.voiceActivity.resetAi();
    resumed.forEach(chunk => this.voiceActivity.addAiChunk(chunk));
    this.holdSuppressedUntil = this.nowMillis() + this.holdCooldownMs;
    this.onProtocolEvent('assistant_playback_resumed');
  }

  private startHoldDeadline(): void {
    if (this.holdJob !== null) {
      clearTimeout(this.holdJob);
    }
    this.holdJob = setTimeout(() => {
      this.holdJob = null;
      if (!this.disposed && this.playback.isHolding) {
        this.resumeHeldTurn();
      }
    }, this.holdTimeoutMs);
  }

  private cancelHoldInternal(): void {
    if (this.holdJob !== null) {
      clearTimeout(this.holdJob);
      this.holdJob = null;
    }
  }
}
