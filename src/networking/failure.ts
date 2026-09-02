export enum WiroFailureCode {
  Authentication = 'Authentication',
  ApiRejected = 'ApiRejected',
  RateLimited = 'RateLimited',
  ServerUnavailable = 'ServerUnavailable',
  NetworkUnavailable = 'NetworkUnavailable',
  RequestTimeout = 'RequestTimeout',
  Cancelled = 'Cancelled',
  MalformedResponse = 'MalformedResponse',
  SocketConnection = 'SocketConnection',
  SocketConnectTimeout = 'SocketConnectTimeout',
  RealtimeProtocol = 'RealtimeProtocol',
  StreamReadyTimeout = 'StreamReadyTimeout',
  SessionBusy = 'SessionBusy',
}

/**
 * A stable, machine-readable failure with a user-facing message.
 *
 * Singleton instances below carry no request-specific detail, so a
 * caught `WiroFailure` never leaks credentials or raw server text —
 * see `DefaultWiroApiClient`, which maps server errors onto these
 * instead of forwarding their bodies.
 */
export class WiroFailure extends Error {
  readonly code: WiroFailureCode;
  readonly diagnostics: Readonly<Record<string, string>>;

  constructor(
    code: WiroFailureCode,
    message: string,
    diagnostics: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = 'WiroFailure';
    this.code = code;
    this.diagnostics = diagnostics;
  }

  toString(): string {
    return this.message;
  }

  static readonly Authentication = new WiroFailure(
    WiroFailureCode.Authentication,
    'Wiro authentication failed. Check the project credentials.',
  );
  static readonly ApiRejected = new WiroFailure(
    WiroFailureCode.ApiRejected,
    'Wiro rejected the model Run request.',
  );
  static readonly RateLimited = new WiroFailure(
    WiroFailureCode.RateLimited,
    'Wiro request limit reached. Try again later.',
  );
  static readonly ServerUnavailable = new WiroFailure(
    WiroFailureCode.ServerUnavailable,
    'Wiro is temporarily unavailable. Try again later.',
  );
  static readonly NetworkUnavailable = new WiroFailure(
    WiroFailureCode.NetworkUnavailable,
    'Could not reach Wiro. Check the network connection.',
  );
  static readonly RequestTimeout = new WiroFailure(
    WiroFailureCode.RequestTimeout,
    'The Wiro request timed out. Try again.',
  );
  static readonly Cancelled = new WiroFailure(
    WiroFailureCode.Cancelled,
    'The Wiro request was cancelled.',
  );
  static readonly MalformedResponse = new WiroFailure(
    WiroFailureCode.MalformedResponse,
    'Wiro returned an unexpected response.',
  );
  static readonly SocketConnection = new WiroFailure(
    WiroFailureCode.SocketConnection,
    'The Wiro realtime connection failed.',
  );
  static readonly SocketConnectTimeout = new WiroFailure(
    WiroFailureCode.SocketConnectTimeout,
    'The Wiro realtime connection timed out. Try again.',
  );
  static readonly RealtimeProtocol = new WiroFailure(
    WiroFailureCode.RealtimeProtocol,
    'Wiro returned an unexpected realtime event.',
  );
  static readonly StreamReadyTimeout = new WiroFailure(
    WiroFailureCode.StreamReadyTimeout,
    'The Wiro realtime stream did not become ready in time.',
  );
  static readonly SessionBusy = new WiroFailure(
    WiroFailureCode.SessionBusy,
    'Another realtime session is already active.',
  );
}
