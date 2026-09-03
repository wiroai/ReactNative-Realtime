import { pcmNormalizedLevel } from '../../audio/pcmLevelMeter';
import { PcmNoiseGate } from '../../audio/pcmNoiseGate';

const DEFAULT_STALL_TIMEOUT_MS = 3_000;
const MINIMUM_WATCHDOG_TICK_MS = 100;

export interface ConversationMicPipelineOptions {
  readonly onStall: () => void;
  readonly noiseGate?: PcmNoiseGate;
  readonly stallTimeoutMs?: number;
  readonly nowMillis?: () => number;
}

export interface ProcessedMicChunk {
  readonly gated: Uint8Array;
  readonly level: number;
}

/**
 * Gates microphone chunks, measures them, and notices when capture
 * dies.
 *
 * Healthy capture produces fifty chunks a second no matter how
 * quiet the room is, so a few silent seconds can only mean the
 * pipeline broke. The stall callback is pure timing.
 */
export class ConversationMicPipeline {
  private readonly onStall: () => void;
  private readonly noiseGate?: PcmNoiseGate;
  private readonly stallTimeoutMs: number;
  private readonly nowMillis: () => number;

  private watchdog: ReturnType<typeof setInterval> | null = null;
  private lastChunkAt = Number.NEGATIVE_INFINITY;
  private disposed = false;

  constructor(options: ConversationMicPipelineOptions) {
    this.onStall = options.onStall;
    this.noiseGate = options.noiseGate;
    this.stallTimeoutMs = options.stallTimeoutMs ?? DEFAULT_STALL_TIMEOUT_MS;
    this.nowMillis = options.nowMillis ?? (() => Date.now());
  }

  process(chunk: Uint8Array, assistantAudible: boolean): ProcessedMicChunk {
    this.lastChunkAt = this.nowMillis();
    if (!this.noiseGate) {
      return { gated: chunk, level: pcmNormalizedLevel(chunk) };
    }
    const gated = this.noiseGate.process(chunk, assistantAudible);
    return { gated, level: this.noiseGate.lastOutputLevel };
  }

  /**
   * Muted capture legitimately delivers nothing; the stall clock
   * only starts once the microphone is expected to speak again.
   */
  markAlive(): void {
    this.lastChunkAt = this.nowMillis();
  }

  startWatchdog(): void {
    if (this.disposed) {
      return;
    }
    this.stopWatchdogInternal();
    this.lastChunkAt = this.nowMillis();
    this.watchdog = setInterval(() => this.checkStall(), this.watchdogTickMs);
  }

  stopWatchdog(): void {
    this.stopWatchdogInternal();
  }

  dispose(): void {
    this.disposed = true;
    this.stopWatchdogInternal();
  }

  private get watchdogTickMs(): number {
    const half = this.stallTimeoutMs / 2;
    return half < MINIMUM_WATCHDOG_TICK_MS ? MINIMUM_WATCHDOG_TICK_MS : half;
  }

  private stopWatchdogInternal(): void {
    if (this.watchdog !== null) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
  }

  private checkStall(): void {
    if (this.disposed) {
      return;
    }
    const elapsed = this.nowMillis() - this.lastChunkAt;
    if (elapsed < this.stallTimeoutMs) {
      return;
    }
    this.onStall();
  }
}
