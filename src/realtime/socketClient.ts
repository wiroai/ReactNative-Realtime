export type RealtimeSocketFrame =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'binary'; readonly bytes: Uint8Array };

export interface RealtimeSocketHandler {
  readonly onFrame: (frame: RealtimeSocketFrame) => void;
  readonly onError: (error: unknown) => void;
  readonly onDone: () => void;
}

export interface RealtimeSocketClient {
  readonly isConnected: boolean;

  connect(): Promise<void>;

  sendText(message: string): Promise<void>;

  sendBinary(bytes: Uint8Array): void;

  close(): Promise<void>;

  setHandler(handler: RealtimeSocketHandler | null): void;
}
