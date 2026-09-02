import { WiroFailure } from '../networking/failure';
import { RealtimeBinaryFrame } from './binaryFrame';
import { RealtimeEvent, RealtimeEventType } from './event';
import { RealtimeEventParser } from './eventParser';
import { WiroRealtimeProtocol } from './protocol';
import { raceTimeout } from './raceTimeout';
import {
  RealtimeSessionMetrics,
  RealtimeSessionMetricsCollector,
} from './sessionMetrics';
import { RealtimeSocketClient, RealtimeSocketFrame } from './socketClient';
import { RealtimeTrace } from './trace';

const DEFAULT_READY_TIMEOUT_MS = 15_000;
const DEFAULT_CLOSE_TIMEOUT_MS = 3_000;

export interface RealtimeSessionOptions {
  readonly socketClient: RealtimeSocketClient;
  readonly taskId: string;
  readonly taskToken: string;
  readonly parser?: RealtimeEventParser;
  readonly readyTimeoutMs?: number;
  readonly closeTimeoutMs?: number;
}

interface ReadyWaiter {
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
}

/**
 * Drives one realtime task's socket lifecycle: subscribe, wait for
 * `task_stream_ready`, stream, and close — either cleanly or after
 * a protocol/socket failure.
 *
 * JS has no shared-memory threads, so the locking that
 * `RealtimeSession` uses in Kotlin collapses to plain instance
 * fields; ordering is instead guaranteed by JS never interleaving
 * two synchronous sections around the same `await`.
 */
export class RealtimeSession {
  private readonly socketClient: RealtimeSocketClient;
  private readonly taskId: string;
  private readonly taskToken: string;
  private readonly parser: RealtimeEventParser;
  private readonly readyTimeoutMs: number;
  private readonly closeTimeoutMs: number;
  private readonly metricsCollector = new RealtimeSessionMetricsCollector();

  private ready = false;
  private closed = false;
  private subscriptionSent = false;
  private sessionEndSent = false;
  private listeners: Array<(event: RealtimeEvent) => void> = [];
  private errorListeners: Array<(error: unknown) => void> = [];
  private doneListeners: Array<() => void> = [];
  private doneNotified = false;
  private readyWaiters: ReadyWaiter[] = [];
  private connectPromise: Promise<void> | null = null;
  private closePromise: Promise<void> | null = null;

  constructor(options: RealtimeSessionOptions) {
    this.socketClient = options.socketClient;
    this.taskId = options.taskId;
    this.taskToken = options.taskToken;
    this.parser = options.parser ?? new RealtimeEventParser();
    this.readyTimeoutMs = options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
    this.closeTimeoutMs = options.closeTimeoutMs ?? DEFAULT_CLOSE_TIMEOUT_MS;
  }

  get isReady(): boolean {
    return this.ready && !this.closed;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  get metrics(): RealtimeSessionMetrics {
    return this.metricsCollector.snapshot();
  }

  addEventListener(listener: (event: RealtimeEvent) => void): void {
    this.listeners = [...this.listeners, listener];
  }

  addErrorListener(listener: (error: unknown) => void): void {
    this.errorListeners = [...this.errorListeners, listener];
  }

  addDoneListener(listener: () => void): void {
    this.doneListeners = [...this.doneListeners, listener];
  }

  connect(): Promise<void> {
    if (!this.connectPromise) {
      this.connectPromise = this.performConnect();
    }
    return this.connectPromise;
  }

  sendAudio(pcmBytes: Uint8Array): boolean {
    if (!this.isReady || pcmBytes.length === 0) {
      return false;
    }
    try {
      this.socketClient.sendBinary(
        RealtimeBinaryFrame.encode(this.taskToken, pcmBytes),
      );
      return true;
    } catch {
      return false;
    }
  }

  sendSessionEnd(): void {
    void this.flushSessionEnd();
  }

  async stop(): Promise<void> {
    await this.flushSessionEnd();
    await this.close();
  }

  close(): Promise<void> {
    if (!this.closePromise) {
      this.closePromise = this.performClose();
    }
    return this.closePromise;
  }

  private async performConnect(): Promise<void> {
    if (this.closed) {
      throw WiroFailure.Cancelled;
    }
    this.socketClient.setHandler({
      onFrame: frame => this.handleFrame(frame),
      onError: () => this.handleSocketError(),
      onDone: () => this.handleSocketDone(),
    });
    RealtimeTrace.line(`session connect task=${this.taskId}`);
    await this.socketClient.connect();
    if (this.closed) {
      await this.socketClient.close();
      throw WiroFailure.Cancelled;
    }
    await this.sendSubscription();
    try {
      await this.waitUntilReady();
      RealtimeTrace.line('session stream ready');
    } catch (error) {
      if (error === WiroFailure.StreamReadyTimeout) {
        RealtimeTrace.line('session ready timeout');
        await this.close();
      }
      throw error;
    }
  }

  private async waitUntilReady(): Promise<void> {
    if (this.isReady) {
      return;
    }
    const outcome = await raceTimeout(this.awaitReady(), this.readyTimeoutMs);
    if (outcome.timedOut) {
      throw WiroFailure.StreamReadyTimeout;
    }
  }

  private awaitReady(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.closed) {
        reject(WiroFailure.Cancelled);
        return;
      }
      if (this.ready) {
        resolve();
        return;
      }
      this.readyWaiters = [...this.readyWaiters, { resolve, reject }];
    });
  }

  private async performClose(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.ready = false;
    const waiters = this.readyWaiters;
    this.readyWaiters = [];
    waiters.forEach(waiter => waiter.reject(WiroFailure.Cancelled));
    await raceTimeout(this.socketClient.close(), this.closeTimeoutMs);
    this.socketClient.setHandler(null);
    this.notifyDone();
  }

  private async flushSessionEnd(): Promise<void> {
    if (this.closed || this.sessionEndSent || !this.socketClient.isConnected) {
      return;
    }
    this.sessionEndSent = true;
    try {
      await this.socketClient.sendText(
        encodeJson(WiroRealtimeProtocol.TASK_SESSION_END, this.taskToken),
      );
    } catch {
      // Best effort; the socket may already be going away.
    }
  }

  private async sendSubscription(): Promise<void> {
    if (this.subscriptionSent) {
      return;
    }
    this.subscriptionSent = true;
    await this.socketClient.sendText(
      encodeJson(WiroRealtimeProtocol.TASK_INFO, this.taskToken),
    );
    RealtimeTrace.line('session sent task_info');
  }

  private handleFrame(frame: RealtimeSocketFrame): void {
    if (this.closed) {
      return;
    }
    const started = nowMicros();
    const event = this.normalize(this.parser.parse(frame));
    const micros = nowMicros() - started;
    this.metricsCollector.record(event, micros);
    this.listeners.forEach(listener => listener(event));
    switch (event.kind) {
      case 'status':
        if (event.type === RealtimeEventType.StreamReady) {
          this.markReady();
        } else if (event.type === RealtimeEventType.PostprocessEnded) {
          void this.close();
        }
        break;
      case 'cancel':
        this.fail(WiroFailure.Cancelled);
        break;
      case 'malformed':
        this.fail(WiroFailure.RealtimeProtocol);
        break;
      default:
        break;
    }
  }

  private normalize(event: RealtimeEvent): RealtimeEvent {
    if (event.kind !== 'binary') {
      return event;
    }
    const payload =
      RealtimeBinaryFrame.decodePayload(this.taskToken, event.bytes) ??
      RealtimeBinaryFrame.decodePayload(this.taskId, event.bytes);
    return payload ? RealtimeEvent.binary(payload) : RealtimeEvent.malformed();
  }

  private markReady(): void {
    this.ready = true;
    const waiters = this.readyWaiters;
    this.readyWaiters = [];
    waiters.forEach(waiter => waiter.resolve());
  }

  private handleSocketError(): void {
    if (this.closed) {
      return;
    }
    this.notifyError(WiroFailure.SocketConnection);
    this.fail(WiroFailure.SocketConnection);
  }

  private handleSocketDone(): void {
    if (this.closed) {
      return;
    }
    this.notifyDone();
    this.fail(WiroFailure.SocketConnection);
  }

  private notifyError(error: unknown): void {
    this.errorListeners.forEach(listener => listener(error));
  }

  private notifyDone(): void {
    if (this.doneNotified) {
      return;
    }
    this.doneNotified = true;
    this.doneListeners.forEach(listener => listener());
  }

  private fail(failure: WiroFailure): void {
    const waiters = this.readyWaiters;
    this.readyWaiters = [];
    waiters.forEach(waiter => waiter.reject(failure));
    void this.close();
  }
}

function encodeJson(type: string, taskToken: string): string {
  return JSON.stringify({ type, tasktoken: taskToken });
}

function nowMicros(): number {
  return Math.round(Date.now() * 1_000);
}
