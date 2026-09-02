import {
  RealtimeSocketClient,
  RealtimeSocketFrame,
  RealtimeSocketHandler,
} from '../socketClient';

export class FakeSocket implements RealtimeSocketClient {
  readonly sentText: string[] = [];
  readonly sentBinary: Uint8Array[] = [];
  connectCalls = 0;
  closeCalls = 0;

  private connected = false;
  private handler: RealtimeSocketHandler | null = null;

  get isConnected(): boolean {
    return this.connected;
  }

  setHandler(handler: RealtimeSocketHandler | null): void {
    this.handler = handler;
  }

  async connect(): Promise<void> {
    this.connectCalls += 1;
    this.connected = true;
  }

  async sendText(message: string): Promise<void> {
    this.sentText.push(message);
  }

  sendBinary(bytes: Uint8Array): void {
    this.sentBinary.push(bytes);
  }

  async close(): Promise<void> {
    if (!this.connected) {
      return;
    }
    this.closeCalls += 1;
    this.connected = false;
  }

  emit(frame: RealtimeSocketFrame): void {
    this.handler?.onFrame(frame);
  }

  emitText(json: string): void {
    this.emit({ kind: 'text', text: json });
  }

  finish(): void {
    this.connected = false;
    this.handler?.onDone();
  }
}
