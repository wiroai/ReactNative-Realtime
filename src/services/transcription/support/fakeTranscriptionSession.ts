import { RealtimeEvent, RealtimeEventType } from '../../../realtime/event';
import { RealtimeSessionClient } from '../../../realtime/session';
import { EMPTY_SESSION_METRICS, RealtimeSessionMetrics } from '../../../realtime/sessionMetrics';

/**
 * A transcription task ends with `PostprocessEnded`, not `Ended`
 * like a conversation — this fake mirrors that so
 * `terminalWait` behaves the way the real socket does.
 */
export class FakeTranscriptionSession implements RealtimeSessionClient {
  private eventListeners: Array<(event: RealtimeEvent) => void> = [];
  private errorListeners: Array<(error: unknown) => void> = [];
  private doneListeners: Array<() => void> = [];
  private readonly audio: Uint8Array[] = [];

  connectCalls = 0;
  sessionEndCalls = 0;
  closeCalls = 0;
  connectError: unknown = null;

  private ready = false;
  private closed = false;

  constructor(private readonly completeSessionEnd: boolean = true) {}

  get sentAudio(): Uint8Array[] {
    return this.audio.slice();
  }

  get isReady(): boolean {
    return this.ready && !this.closed;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  get metrics(): RealtimeSessionMetrics {
    return EMPTY_SESSION_METRICS;
  }

  addEventListener(listener: (event: RealtimeEvent) => void): void {
    this.eventListeners = [...this.eventListeners, listener];
  }

  addErrorListener(listener: (error: unknown) => void): void {
    this.errorListeners = [...this.errorListeners, listener];
  }

  addDoneListener(listener: () => void): void {
    this.doneListeners = [...this.doneListeners, listener];
  }

  async connect(): Promise<void> {
    this.connectCalls += 1;
    const error = this.connectError;
    this.connectError = null;
    if (error) {
      throw error;
    }
    this.closed = false;
    this.ready = true;
    this.sessionEndCalls = 0;
  }

  sendAudio(pcmBytes: Uint8Array): boolean {
    if (!this.isReady) {
      return false;
    }
    this.audio.push(pcmBytes.slice());
    return true;
  }

  sendSessionEnd(): void {
    if (this.closed || this.sessionEndCalls > 0) {
      return;
    }
    this.sessionEndCalls += 1;
    if (this.completeSessionEnd) {
      this.emit(RealtimeEvent.status(RealtimeEventType.PostprocessEnded));
    }
  }

  async stop(): Promise<void> {
    this.sendSessionEnd();
    await this.close();
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closeCalls += 1;
    this.closed = true;
    this.ready = false;
  }

  emit(event: RealtimeEvent): void {
    this.eventListeners.forEach(listener => listener(event));
  }

  emitError(error: unknown): void {
    this.errorListeners.forEach(listener => listener(error));
  }

  emitDone(): void {
    this.doneListeners.forEach(listener => listener());
  }
}
