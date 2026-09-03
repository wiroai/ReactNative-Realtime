/**
 * Folds progressive `TRANSCRIPT_USER` events into running text.
 *
 * The model streams each utterance and starts over at the next
 * one, so a raw replace would leave only the last fragment. An
 * event that extends the live utterance refines it; one that does
 * not is a new utterance, and the finished one is confirmed.
 */
export class TranscriptAssembler {
  private confirmedValue = '';
  private liveValue = '';

  get confirmed(): string {
    return this.confirmedValue;
  }

  get live(): string {
    return this.liveValue;
  }

  reset(): void {
    this.confirmedValue = '';
    this.liveValue = '';
  }

  applyUserText(text: string): string | null {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return null;
    }
    if (trimmed.startsWith(this.liveValue) || this.liveValue.length === 0) {
      this.liveValue = trimmed;
    } else if (!this.liveValue.startsWith(trimmed)) {
      this.confirmedValue = this.joined();
      this.liveValue = trimmed;
    }
    return this.joined();
  }

  joined(): string {
    if (this.confirmedValue.length === 0) {
      return this.liveValue;
    }
    return `${this.confirmedValue} ${this.liveValue}`;
  }
}
