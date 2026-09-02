import { RealtimeEvent, realtimeEventTypeFromWire } from './event';
import { WiroRealtimeProtocol } from './protocol';
import { RealtimeSocketFrame } from './socketClient';

export class RealtimeEventParser {
  parse(frame: RealtimeSocketFrame): RealtimeEvent {
    if (frame.kind === 'binary') {
      return RealtimeEvent.binary(frame.bytes);
    }
    return this.parseJson(frame.text);
  }

  private parseJson(text: string): RealtimeEvent {
    const obj = parseJsonObject(text);
    if (!obj) {
      return RealtimeEvent.malformed();
    }
    const wireType = typeof obj.type === 'string' ? obj.type : '';
    if (!wireType) {
      return RealtimeEvent.malformed();
    }
    if (wireType === WiroRealtimeProtocol.TASK_OUTPUT) {
      return this.parseOutput(obj);
    }
    if (
      wireType === WiroRealtimeProtocol.TASK_ERROR ||
      wireType === WiroRealtimeProtocol.TASK_ERROR_FULL
    ) {
      return RealtimeEvent.error(wireType);
    }
    if (wireType === WiroRealtimeProtocol.TASK_CANCEL) {
      return RealtimeEvent.cancel();
    }
    const known = realtimeEventTypeFromWire(wireType);
    return known ? RealtimeEvent.status(known) : RealtimeEvent.unknown(wireType);
  }

  private parseOutput(obj: Readonly<Record<string, unknown>>): RealtimeEvent {
    const message = typeof obj.message === 'string' ? obj.message : null;
    return message === null
      ? RealtimeEvent.malformed()
      : RealtimeEvent.output(message);
  }
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}
