import { RealtimeEvent, RealtimeEventType } from './event';
import { RealtimeEventParser } from './eventParser';

describe('RealtimeEventParser', () => {
  const parser = new RealtimeEventParser();

  it('parses known realtime status events', () => {
    const event = parser.parse({
      kind: 'text',
      text: '{"type":"task_stream_ready"}',
    });

    expect(event).toEqual(RealtimeEvent.status(RealtimeEventType.StreamReady));
  });

  it('parses progressive transcript output', () => {
    const event = parser.parse({
      kind: 'text',
      text: '{"type":"task_output","message":"TRANSCRIPT_USER:Hello"}',
    });

    expect(event).toEqual(RealtimeEvent.output('TRANSCRIPT_USER:Hello'));
  });

  it('does not retain raw server error details', () => {
    const event = parser.parse({
      kind: 'text',
      text: '{"type":"task_error","message":"secret server detail"}',
    });

    expect(event).toEqual(RealtimeEvent.error('task_error'));
    expect(JSON.stringify(event)).not.toContain('secret');
  });

  it('parses binary frames without decoding audio', () => {
    const event = parser.parse({
      kind: 'binary',
      bytes: new Uint8Array([1, 2, 3]),
    });

    expect(event).toEqual(RealtimeEvent.binary(new Uint8Array([1, 2, 3])));
  });

  it('keeps unknown event types forward compatible', () => {
    const event = parser.parse({
      kind: 'text',
      text: '{"type":"task_future_event"}',
    });

    expect(event).toEqual(RealtimeEvent.unknown('task_future_event'));
  });

  it('maps invalid frames to a malformed event', () => {
    expect(parser.parse({ kind: 'text', text: 'not-json' })).toEqual(
      RealtimeEvent.malformed(),
    );
    expect(
      parser.parse({ kind: 'text', text: '{"message":"missing type"}' }),
    ).toEqual(RealtimeEvent.malformed());
  });
});
