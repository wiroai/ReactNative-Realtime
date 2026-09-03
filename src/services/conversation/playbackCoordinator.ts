import { AudioConstants } from '../../audio/audioConstants';
import { PcmAudioPlayer } from '../../audio/playback';

const EPOCH = 0;
const BYTES_PER_SECOND =
  (AudioConstants.SAMPLE_RATE_HZ *
    AudioConstants.CHANNEL_COUNT *
    AudioConstants.BITS_PER_SAMPLE) /
  8;
const BYTES_PER_FRAME =
  (AudioConstants.CHANNEL_COUNT * AudioConstants.BITS_PER_SAMPLE) / 8;

/**
 * What happened to a chunk of assistant audio on its way to the
 * speaker.
 *
 * The two outcomes are independent: a chunk can clear an
 * interrupted turn and still be dropped by a full queue.
 */
export interface PlaybackEnqueueResult {
  readonly flushedPreviousTurn: boolean;
  readonly droppedChunk: boolean;
  readonly silencedChunk?: boolean;
  readonly heldChunk?: boolean;
}

interface RetainedChunk {
  readonly bytes: Uint8Array;
  readonly start: number;
  readonly end: number;
}

function durationOfMs(bytes: Uint8Array): number {
  return (bytes.length * 1_000) / BYTES_PER_SECOND;
}

/**
 * Feeds assistant audio to the player and decides what happens to
 * audio left over from a turn the user interrupted.
 *
 * A finished turn keeps playing its queued tail so speech stays
 * gapless. A suspected interruption silences the speaker while
 * keeping the retained audio; a confirmed one discards the rest.
 */
export class ConversationPlaybackCoordinator {
  private readonly player: PcmAudioPlayer;
  private readonly nowMillis: () => number;

  private retained: RetainedChunk[] = [];
  private playheadUntil = EPOCH;
  private heldAt: number | null = null;
  private heldTurnWasFinished = false;
  private previousTurnPending = false;
  private turnInterrupted = false;

  constructor(player: PcmAudioPlayer, nowMillis: () => number = () => Date.now()) {
    this.player = player;
    this.nowMillis = nowMillis;
  }

  get isHolding(): boolean {
    return this.heldAt !== null;
  }

  /**
   * Marks the assistant's turn as finished while its queued tail
   * keeps playing, so the next turn knows it has to clear that
   * tail.
   */
  markTurnFinished(): void {
    if (this.turnInterrupted) {
      this.turnInterrupted = false;
      return;
    }
    if (this.heldAt !== null) {
      this.heldTurnWasFinished = true;
      return;
    }
    this.previousTurnPending = true;
  }

  /**
   * Silences the turn on a suspected interruption while keeping its
   * unplayed audio.
   */
  holdTurn(): boolean {
    if (this.turnInterrupted || this.heldAt !== null) {
      return false;
    }
    const now = this.nowMillis();
    this.pruneRetained(now);
    if (this.retained.length === 0) {
      return false;
    }
    this.heldAt = now;
    this.heldTurnWasFinished = this.previousTurnPending;
    this.previousTurnPending = false;
    this.player.flush();
    return true;
  }

  /**
   * The suspicion proved to be noise: puts the held audio back on
   * the player, trimmed to the point the hold silenced it.
   */
  resumeHeldTurn(): Uint8Array[] {
    const held = this.heldAt;
    if (held === null) {
      return [];
    }
    this.heldAt = null;
    if (this.heldTurnWasFinished) {
      this.previousTurnPending = true;
      this.heldTurnWasFinished = false;
    }
    const chunks = this.retained;
    this.retained = [];
    const resumed: Uint8Array[] = [];
    let start = this.nowMillis();
    chunks.forEach(chunk => {
      const bytes = chunk.start < held ? this.trimHeard(chunk, held) : chunk.bytes;
      if (bytes.length === 0) {
        return;
      }
      const end = start + durationOfMs(bytes);
      this.retained.push({ bytes, start, end });
      start = end;
      if (this.player.tryEnqueue(bytes)) {
        resumed.push(bytes);
      }
    });
    this.playheadUntil = start;
    return resumed;
  }

  /**
   * Cuts the assistant off: queued, buffered or held audio is
   * discarded, and further chunks of the same turn are dropped.
   */
  interruptTurn(): boolean {
    if (this.turnInterrupted) {
      return false;
    }
    if (this.heldAt !== null) {
      this.heldAt = null;
      if (this.heldTurnWasFinished) {
        this.heldTurnWasFinished = false;
      } else {
        this.turnInterrupted = true;
      }
      this.discardRetained();
      return true;
    }
    if (this.previousTurnPending) {
      this.previousTurnPending = false;
    } else {
      this.turnInterrupted = true;
    }
    this.discardRetained();
    this.player.flush();
    return true;
  }

  reset(): void {
    this.previousTurnPending = false;
    this.turnInterrupted = false;
    this.heldAt = null;
    this.heldTurnWasFinished = false;
    this.discardRetained();
  }

  enqueue(bytes: Uint8Array): PlaybackEnqueueResult {
    if (this.turnInterrupted) {
      return {
        flushedPreviousTurn: false,
        droppedChunk: false,
        silencedChunk: true,
      };
    }
    if (this.heldAt !== null) {
      if (!this.heldTurnWasFinished) {
        this.retainDuringHold(bytes);
        return {
          flushedPreviousTurn: false,
          droppedChunk: false,
          heldChunk: true,
        };
      }
      this.heldAt = null;
      this.heldTurnWasFinished = false;
      this.discardRetained();
      return {
        flushedPreviousTurn: true,
        droppedChunk: !this.enqueueAndRetain(bytes),
      };
    }
    let flushedPreviousTurn = false;
    if (this.previousTurnPending) {
      this.previousTurnPending = false;
      this.discardRetained();
      this.player.flush();
      flushedPreviousTurn = true;
    }
    return {
      flushedPreviousTurn,
      droppedChunk: !this.enqueueAndRetain(bytes),
    };
  }

  private enqueueAndRetain(bytes: Uint8Array): boolean {
    const now = this.nowMillis();
    this.pruneRetained(now);
    if (!this.player.tryEnqueue(bytes)) {
      return false;
    }
    const start = this.playheadUntil > now ? this.playheadUntil : now;
    const end = start + durationOfMs(bytes);
    this.retained.push({ bytes, start, end });
    this.playheadUntil = end;
    return true;
  }

  private retainDuringHold(bytes: Uint8Array): void {
    const last = this.retained[this.retained.length - 1];
    const start = last ? last.end : this.nowMillis();
    this.retained.push({ bytes, start, end: start + durationOfMs(bytes) });
  }

  /**
   * A hold freezes pruning: the clock keeps running while the
   * speaker is silent, and pruning against it would count silence
   * as playback.
   */
  private pruneRetained(now: number): void {
    if (this.heldAt !== null) {
      return;
    }
    while (this.retained.length > 0 && this.retained[0].end <= now) {
      this.retained.shift();
    }
  }

  private discardRetained(): void {
    this.retained = [];
    this.playheadUntil = EPOCH;
  }

  private trimHeard(chunk: RetainedChunk, heldAt: number): Uint8Array {
    const heardMs = heldAt - chunk.start;
    let offset = Math.trunc((heardMs * BYTES_PER_SECOND) / 1_000);
    offset -= offset % BYTES_PER_FRAME;
    if (offset <= 0) {
      return chunk.bytes;
    }
    if (offset >= chunk.bytes.length) {
      return new Uint8Array(0);
    }
    return chunk.bytes.slice(offset);
  }
}
