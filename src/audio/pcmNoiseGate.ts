import { AudioConstants } from './audioConstants';
import { pcmNormalizedLevel } from './pcmLevelMeter';

const HISTORY_LENGTH = 50;
const LOUD_CAPTURE_ALPHA = 0.001;
const STEADY_CAPTURE_ALPHA = 0.02;

export interface PcmNoiseGateOptions {
  readonly minOpenLevel?: number;
  readonly assistantOpenLevel?: number;
  readonly floorMultiplier?: number;
  readonly floorCap?: number;
  readonly hangoverMs?: number;
  readonly hangoverFraction?: number;
  readonly flatnessLimit?: number;
  readonly closedGain?: number;
  readonly nowMillis?: () => number;
}

/**
 * Keeps steady background sound — a television, traffic, a fan —
 * out of the microphone stream while letting near-field speech
 * through.
 *
 * Closed chunks are strongly attenuated instead of dropped or
 * zeroed, so the uplink keeps real-time pacing and carries room
 * tone: the server's voice detection hears a quiet room rather than
 * a dead wire.
 */
export class PcmNoiseGate {
  readonly minOpenLevel: number;
  readonly assistantOpenLevel: number;
  readonly floorMultiplier: number;
  readonly floorCap: number;
  readonly hangoverMs: number;
  readonly hangoverFraction: number;
  readonly flatnessLimit: number;
  readonly closedGain: number;
  private readonly nowMillis: () => number;

  private readonly history = new Array<number>(HISTORY_LENGTH).fill(0);
  private historyCount = 0;
  private historyCursor = 0;
  private floor = 0;
  private lastOutputLevelValue = 0;
  private openUntilMillis: number | null = null;

  constructor(options: PcmNoiseGateOptions = {}) {
    this.minOpenLevel = options.minOpenLevel ?? 0.28;
    this.assistantOpenLevel = options.assistantOpenLevel ?? 0.4;
    this.floorMultiplier = options.floorMultiplier ?? 1.6;
    this.floorCap = options.floorCap ?? 0.5;
    this.hangoverMs = options.hangoverMs ?? 600;
    this.hangoverFraction = options.hangoverFraction ?? 0.5;
    this.flatnessLimit = options.flatnessLimit ?? 0.15;
    this.closedGain = options.closedGain ?? 0.05;
    this.nowMillis = options.nowMillis ?? (() => Date.now());
  }

  get ambientFloor(): number {
    return this.floor;
  }

  get lastOutputLevel(): number {
    return this.lastOutputLevelValue;
  }

  get hearsHum(): boolean {
    if (this.historyCount < HISTORY_LENGTH) {
      return false;
    }
    const mean = this.history.reduce((sum, level) => sum + level, 0) / HISTORY_LENGTH;
    if (mean <= 0) {
      return false;
    }
    const squares = this.history.reduce((sum, level) => {
      const deviation = level - mean;
      return sum + deviation * deviation;
    }, 0);
    const spread = Math.sqrt(squares / HISTORY_LENGTH);
    return spread / mean < this.flatnessLimit;
  }

  get isOpen(): boolean {
    const until = this.openUntilMillis;
    return until !== null && this.nowMillis() < until;
  }

  process(chunk: Uint8Array, assistantAudible = false): Uint8Array {
    const level = pcmNormalizedLevel(chunk);
    this.history[this.historyCursor] = level;
    this.historyCursor = (this.historyCursor + 1) % HISTORY_LENGTH;
    if (this.historyCount < HISTORY_LENGTH) {
      this.historyCount += 1;
    }
    const now = this.nowMillis();
    const baseOpenLevel = assistantAudible
      ? Math.max(this.minOpenLevel, this.assistantOpenLevel)
      : this.minOpenLevel;
    const openThreshold = Math.max(baseOpenLevel, this.floor * this.floorMultiplier);
    if (level >= openThreshold) {
      this.openUntilMillis = now + this.hangoverMs;
      const alpha = this.hearsHum ? STEADY_CAPTURE_ALPHA : LOUD_CAPTURE_ALPHA;
      this.raiseFloor(level, alpha);
      this.lastOutputLevelValue = level;
      return chunk;
    }
    this.raiseFloor(level, level > this.floor ? 0.04 : 0.12);
    const until = this.openUntilMillis;
    if (
      until !== null &&
      now < until &&
      level >= openThreshold * this.hangoverFraction
    ) {
      this.lastOutputLevelValue = level;
      return chunk;
    }
    this.lastOutputLevelValue = level * this.closedGain;
    return this.attenuated(chunk);
  }

  reset(): void {
    this.floor = 0;
    this.lastOutputLevelValue = 0;
    this.history.fill(0);
    this.historyCount = 0;
    this.historyCursor = 0;
    this.openUntilMillis = null;
  }

  private raiseFloor(level: number, alpha: number): void {
    this.floor = Math.min(this.floorCap, this.floor + (level - this.floor) * alpha);
  }

  private attenuated(chunk: Uint8Array): Uint8Array {
    const copy = chunk.slice();
    const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
    const samples = Math.floor(copy.length / AudioConstants.BYTES_PER_SAMPLE);
    for (let index = 0; index < samples; index += 1) {
      const scaled = view.getInt16(index * 2, true) * this.closedGain;
      view.setInt16(index * 2, Math.round(scaled), true);
    }
    return copy;
  }
}
