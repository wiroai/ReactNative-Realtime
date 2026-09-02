import { WiroRealtimeProtocol } from './protocol';

export enum RealtimeEventType {
  Queue = 'task_queue',
  Accepted = 'task_accept',
  PreprocessStarted = 'task_preprocess_start',
  PreprocessEnded = 'task_preprocess_end',
  Assigned = 'task_assign',
  Started = 'task_start',
  OutputFull = 'task_output_full',
  Ended = 'task_end',
  PostprocessStarted = 'task_postprocess_start',
  PostprocessEnded = 'task_postprocess_end',
  StreamReady = 'task_stream_ready',
  StreamEnded = 'task_stream_end',
  Cost = 'task_cost',
}

export function realtimeEventTypeFromWire(
  wireName: string,
): RealtimeEventType | null {
  const values: readonly string[] = Object.values(RealtimeEventType);
  return values.includes(wireName) ? (wireName as RealtimeEventType) : null;
}

export type RealtimeEvent =
  | { readonly kind: 'status'; readonly type: RealtimeEventType }
  | { readonly kind: 'output'; readonly message: string }
  | { readonly kind: 'error'; readonly wireTypeName: string }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'binary'; readonly bytes: Uint8Array }
  | { readonly kind: 'unknown'; readonly wireTypeName: string }
  | { readonly kind: 'malformed' };

export const RealtimeEvent = {
  status: (type: RealtimeEventType): RealtimeEvent => ({
    kind: 'status',
    type,
  }),
  output: (message: string): RealtimeEvent => ({ kind: 'output', message }),
  error: (wireTypeName: string): RealtimeEvent => ({
    kind: 'error',
    wireTypeName,
  }),
  cancel: (): RealtimeEvent => ({ kind: 'cancel' }),
  binary: (bytes: Uint8Array): RealtimeEvent => ({ kind: 'binary', bytes }),
  unknown: (wireTypeName: string): RealtimeEvent => ({
    kind: 'unknown',
    wireTypeName,
  }),
  malformed: (): RealtimeEvent => ({ kind: 'malformed' }),
};

export function realtimeEventWireType(event: RealtimeEvent): string {
  switch (event.kind) {
    case 'status':
      return event.type;
    case 'output':
      return WiroRealtimeProtocol.TASK_OUTPUT;
    case 'error':
    case 'unknown':
      return event.wireTypeName;
    case 'cancel':
      return WiroRealtimeProtocol.TASK_CANCEL;
    case 'binary':
      return 'binary';
    case 'malformed':
      return 'malformed';
  }
}
