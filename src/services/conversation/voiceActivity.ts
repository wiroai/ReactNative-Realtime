import { AudioConstants } from '../../audio/audioConstants';
import { pcmNormalizedLevel } from '../../audio/pcmLevelMeter';

const EPOCH = 0;
const SPEECH_THRESHOLD = 0.18;
const INTERRUPT_THRESHOLD = 0.4;
const INTERRUPT_SUSTAIN_THRESHOLD = 0.25;
const SUSPECT_STREAK_TARGET = 3;
const CONFIRM_STREAK_TARGET = 8;
const USER_HANGOVER_MS = 450;
const BYTES_PER_SECOND =
  (AudioConstants.SAMPLE_RATE_HZ *
    AudioConstants.CHANNEL_COUNT *
    AudioConstants.BITS_PER_SAMPLE) /
  8;

export enum ConversationVoicePhase {
  Quiet = 'Quiet',
  UserSpeaking = 'UserSpeaking',
  AiSpeaking = 'AiSpeaking',
}

interface AiAudioSegment {
  readonly start: number;
  readonly end: number;
  readonly level: number;
}

/**
 * Live voice signals for barge-in.
 *
 * `phase` is discrete. `userLevel` is continuous and silent: it is
 * meant to be polled, so fifty audio chunks a second never schedule
 * a rebuild on their own.
 *
 * Assistant audio arrives from the network far faster than it
 * plays. Every enqueued chunk extends a playhead by its own
 * duration, and the assistant counts as speaking while the
 * playhead is in the future.
 */
export class ConversationVoiceActivity {
  private readonly nowMillis: () => number;

  private aiSegments: AiAudioSegment[] = [];
  private userLevelValue = 0;
  private interruptStreak = 0;
  private userActiveUntil = EPOCH;
  private aiPlayheadUntil = EPOCH;
  private currentPhase = ConversationVoicePhase.Quiet;
  private phaseJob: ReturnType<typeof setTimeout> | null = null;
  private phaseListeners: Array<(phase: ConversationVoicePhase) => void> = [];
  private disposed = false;

  constructor(nowMillis: () => number = () => Date.now()) {
    this.nowMillis = nowMillis;
  }

  get phase(): ConversationVoicePhase {
    return this.currentPhase;
  }

  /**
   * Fires on phase transitions only. Levels stay poll-only; the
   * phase is the one signal a screen has to redraw text for, and it
   * changes a few times per sentence rather than fifty times a second.
   */
  subscribePhase(listener: (phase: ConversationVoicePhase) => void): () => void {
    this.phaseListeners.push(listener);
    return () => {
      const index = this.phaseListeners.indexOf(listener);
      if (index !== -1) {
        this.phaseListeners.splice(index, 1);
      }
    };
  }

  get userLevel(): number {
    return this.userLevelValue;
  }

  /**
   * True while queued assistant audio is still playing through the
   * speaker, which is exactly when microphone input may carry echo.
   */
  get aiAudioPending(): boolean {
    return this.nowMillis() < this.aiPlayheadUntil;
  }

  /**
   * True while the user has been loud over pending assistant audio
   * just long enough to be either speech or a burst of noise.
   */
  get userMaybeInterrupting(): boolean {
    return (
      this.interruptStreak >= SUSPECT_STREAK_TARGET &&
      this.nowMillis() < this.aiPlayheadUntil
    );
  }

  /**
   * True once loud input over pending assistant audio has sustained
   * the way only speech does.
   */
  get userInterrupting(): boolean {
    return (
      this.interruptStreak >= CONFIRM_STREAK_TARGET &&
      this.nowMillis() < this.aiPlayheadUntil
    );
  }

  get hasInterruptEvidence(): boolean {
    return this.interruptStreak > 0;
  }

  get aiLevel(): number {
    const now = this.nowMillis();
    this.pruneExpiredSegments(now);
    const head = this.aiSegments[0];
    if (!head) {
      return 0;
    }
    return head.start > now ? 0 : head.level;
  }

  addUserChunk(chunk: Uint8Array, level?: number): void {
    if (this.disposed) {
      return;
    }
    const measured = level ?? pcmNormalizedLevel(chunk);
    const smoothing = measured > this.userLevelValue ? 0.5 : 0.2;
    this.userLevelValue += (measured - this.userLevelValue) * smoothing;
    const now = this.nowMillis();
    const aiPending = now < this.aiPlayheadUntil;
    if (!aiPending) {
      this.interruptStreak = 0;
    } else if (measured >= INTERRUPT_THRESHOLD) {
      if (this.interruptStreak < CONFIRM_STREAK_TARGET) {
        this.interruptStreak += 1;
      }
    } else if (measured < INTERRUPT_SUSTAIN_THRESHOLD && this.interruptStreak > 0) {
      this.interruptStreak -= 1;
    }
    const threshold = aiPending ? INTERRUPT_THRESHOLD : SPEECH_THRESHOLD;
    if (measured >= threshold) {
      this.userActiveUntil = now + USER_HANGOVER_MS;
    }
    this.updatePhase(now);
  }

  addAiChunk(chunk: Uint8Array): void {
    if (this.disposed) {
      return;
    }
    const now = this.nowMillis();
    this.pruneExpiredSegments(now);
    const start = this.aiPlayheadUntil > now ? this.aiPlayheadUntil : now;
    const end = start + this.chunkDurationMs(chunk);
    this.aiSegments.push({ start, end, level: pcmNormalizedLevel(chunk) });
    this.aiPlayheadUntil = end;
    this.updatePhase(now);
  }

  resetAi(): void {
    if (this.disposed) {
      return;
    }
    this.aiSegments = [];
    this.aiPlayheadUntil = EPOCH;
    this.updatePhase(this.nowMillis());
  }

  resetUser(): void {
    if (this.disposed) {
      return;
    }
    this.userLevelValue = 0;
    this.interruptStreak = 0;
    this.userActiveUntil = EPOCH;
    this.updatePhase(this.nowMillis());
  }

  reset(): void {
    if (this.disposed) {
      return;
    }
    this.aiSegments = [];
    this.aiPlayheadUntil = EPOCH;
    this.userLevelValue = 0;
    this.interruptStreak = 0;
    this.userActiveUntil = EPOCH;
    this.updatePhase(this.nowMillis());
  }

  dispose(): void {
    this.disposed = true;
    this.phaseListeners = [];
    if (this.phaseJob !== null) {
      clearTimeout(this.phaseJob);
      this.phaseJob = null;
    }
  }

  /**
   * The user keeps priority: interrupting the assistant should
   * feel heard immediately.
   */
  private updatePhase(now: number): void {
    const next =
      now < this.userActiveUntil
        ? ConversationVoicePhase.UserSpeaking
        : now < this.aiPlayheadUntil
          ? ConversationVoicePhase.AiSpeaking
          : ConversationVoicePhase.Quiet;
    this.schedulePhaseCheck(now);
    if (next === this.currentPhase) {
      return;
    }
    this.currentPhase = next;
    this.phaseListeners.forEach(listener => listener(next));
  }

  private schedulePhaseCheck(now: number): void {
    if (this.phaseJob !== null) {
      clearTimeout(this.phaseJob);
      this.phaseJob = null;
    }
    const nearest = [this.userActiveUntil, this.aiPlayheadUntil]
      .filter(value => value > now)
      .reduce((min, value) => (min === null || value < min ? value : min), null as number | null);
    if (nearest === null) {
      return;
    }
    const delayMs = nearest - now + 20;
    this.phaseJob = setTimeout(() => {
      if (!this.disposed) {
        this.updatePhase(this.nowMillis());
      }
    }, delayMs);
  }

  private pruneExpiredSegments(now: number): void {
    while (this.aiSegments.length > 0 && this.aiSegments[0].end <= now) {
      this.aiSegments.shift();
    }
  }

  private chunkDurationMs(chunk: Uint8Array): number {
    return (chunk.length * 1_000) / BYTES_PER_SECOND;
  }
}
