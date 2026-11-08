/**
 * Builds the running text from `TRANSCRIPT_USER` pieces.
 *
 * Each piece carries only new text, often a single word or a short
 * phrase, and never repeats or revises an earlier one. The full
 * transcript is every non-empty piece, trimmed and joined with
 * single spaces, which is also how the server saves it.
 */
export class TranscriptAssembler {
  private transcript = '';

  reset(): void {
    this.transcript = '';
  }

  /**
   * Appends one piece and returns the whole transcript, or `null`
   * when the piece holds no text.
   */
  applyUserText(text: string): string | null {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return null;
    }
    this.transcript =
      this.transcript.length === 0 ? trimmed : `${this.transcript} ${trimmed}`;
    return this.transcript;
  }

  joined(): string {
    return this.transcript;
  }
}
