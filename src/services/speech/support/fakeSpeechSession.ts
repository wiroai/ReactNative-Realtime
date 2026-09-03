import { WiroFailure } from '../../../networking/failure';
import { RealtimeEvent, RealtimeEventType } from '../../../realtime/event';
import { RealtimeSessionClient } from '../../../realtime/session';
import { EMPTY_SESSION_METRICS, RealtimeSessionMetrics } from '../../../realtime/sessionMetrics';

/**
 * Like `FakeTranscriptionSession`, but can also fail `connect()` a
 * fixed number of times before succeeding — exercises the speech
 * service's socket-reconnect loop.
 */
export class FakeSpeechSession implements RealtimeSessionClient {
  private eventListeners: Array<(event: RealtimeEvent) => void> = [];
  private errorListeners: Array<(error: unknown) => void> = [];
  private doneListeners: Array<() => void> = [];

  connectCalls = 0;
  sessionEndCalls = 0;
  closeCalls = 0;

  private ready = false;
  private closed = false;
  private connectFailures: number;

  constructor(
    private readonly completeSessionEnd: boolean = true,
    connectFailures: number = 0,
  ) {
    this.connectFailures = connectFailures;
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
    if (this.connectFailures > 0) {
      this.connectFailures -= 1;
      throw WiroFailure.SocketConnection;
    }
    this.closed = false;
    this.ready = true;
    this.sessionEndCalls = 0;
  }

  sendAudio(): boolean {
    return false;
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
