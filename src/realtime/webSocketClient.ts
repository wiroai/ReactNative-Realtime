import { WiroEndpoints } from '../networking/endpoints';
import { WiroFailure } from '../networking/failure';
import { raceTimeout } from './raceTimeout';
import { RealtimeSocketClient, RealtimeSocketFrame, RealtimeSocketHandler } from './socketClient';
import { RealtimeTrace } from './trace';

const GOING_AWAY = 1001;
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;

export interface WebSocketRealtimeSocketClientOptions {
  readonly endpoint?: string;
  readonly connectTimeoutMs?: number;
  readonly createWebSocket?: (url: string) => WebSocket;
}

/**
 * Built-in `WebSocket`-based `RealtimeSocketClient`, ported from
 * `OkHttpRealtimeSocketClient`.
 */
export class WebSocketRealtimeSocketClient implements RealtimeSocketClient {
  private readonly endpoint: string;
  private readonly connectTimeoutMs: number;
  private readonly createWebSocket: (url: string) => WebSocket;

  private socket: WebSocket | null = null;
  private handler: RealtimeSocketHandler | null = null;
  private connected = false;
  private closed = false;

  constructor(options: WebSocketRealtimeSocketClientOptions = {}) {
    this.endpoint = options.endpoint ?? WiroEndpoints.SOCKET_URL;
    this.connectTimeoutMs =
      options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.createWebSocket =
      options.createWebSocket ?? (url => new WebSocket(url));
  }

  get isConnected(): boolean {
    return this.connected && !this.closed;
  }

  setHandler(handler: RealtimeSocketHandler | null): void {
    this.handler = handler;
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }
    if (this.closed) {
      throw WiroFailure.SocketConnection;
    }
    RealtimeTrace.line(`socket connecting ${this.endpoint}`);
    const socket = this.createWebSocket(this.endpoint);
    // React Native's WebSocket supports binaryType at runtime, but
    // its bundled type declarations omit the property.
    (socket as unknown as { binaryType: string }).binaryType = 'arraybuffer';
    this.socket = socket;

    const handshake = new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = () => reject(WiroFailure.SocketConnection);
    });
    socket.onmessage = event => this.handleMessage(event.data);
    socket.onclose = () => this.handleClose();

    const outcome = await raceTimeout(handshake, this.connectTimeoutMs);
    if (outcome.timedOut) {
      this.tearDownSocket();
      throw WiroFailure.SocketConnectTimeout;
    }
    this.connected = true;
    RealtimeTrace.line('socket handshake complete');
  }

  async sendText(message: string): Promise<void> {
    this.connectedSocket().send(message);
  }

  sendBinary(bytes: Uint8Array): void {
    this.connectedSocket().send(bytes);
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.connected = false;
    this.tearDownSocket();
  }

  private connectedSocket(): WebSocket {
    if (!this.connected || this.closed || !this.socket) {
      throw WiroFailure.SocketConnection;
    }
    return this.socket;
  }

  private tearDownSocket(): void {
    const socket = this.socket;
    this.socket = null;
    this.connected = false;
    socket?.close(GOING_AWAY);
  }

  private handleMessage(data: unknown): void {
    const frame = toFrame(data);
    if (frame) {
      this.handler?.onFrame(frame);
    }
  }

  private handleClose(): void {
    const wasClosed = this.closed;
    this.connected = false;
    if (!wasClosed) {
      this.handler?.onDone();
    }
  }
}

function toFrame(data: unknown): RealtimeSocketFrame | null {
  if (typeof data === 'string') {
    return { kind: 'text', text: data };
  }
  if (data instanceof ArrayBuffer) {
    return { kind: 'binary', bytes: new Uint8Array(data) };
  }
  return null;
}
