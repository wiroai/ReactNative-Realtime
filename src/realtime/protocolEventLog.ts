/**
 * Bounded history of realtime protocol events surfaced in the debug
 * panel.
 *
 * Only the newest `maximumEvents` entries are retained so that a
 * long running session cannot grow view state without bound.
 */
export class ProtocolEventLog {
  private stored: readonly string[] = [];

  constructor(readonly maximumEvents: number = 40) {
    if (maximumEvents <= 0) {
      throw new Error('maximumEvents must be positive');
    }
  }

  get events(): readonly string[] {
    return this.stored;
  }

  add(event: string): readonly string[] {
    let retained = this.stored;
    if (retained.length >= this.maximumEvents) {
      retained = retained.slice(retained.length - this.maximumEvents + 1);
    }
    retained = [...retained, event];
    this.stored = retained;
    return retained;
  }

  clear(): void {
    this.stored = [];
  }
}
