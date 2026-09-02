import { WiroFailure } from '../networking/failure';
import { RealtimeEvent } from './event';
import { RealtimeSession } from './session';
import { FakeSocket } from './support/fakeSocket';
import { waitUntil } from './support/waitUntil';

function makeSession(
  socket: FakeSocket,
  readyTimeoutMs = 1_000,
): RealtimeSession {
  return new RealtimeSession({
    socketClient: socket,
    taskId: '2743770',
    taskToken: 'task-token',
    readyTimeoutMs,
  });
}

async function connectReady(
  session: RealtimeSession,
  socket: FakeSocket,
): Promise<void> {
  const connecting = session.connect();
  await waitUntil(() => socket.sentText.length === 1);
  socket.emitText('{"type":"task_stream_ready"}');
  await connecting;
}

function decodeJson(text: string): Record<string, string> {
  return JSON.parse(text) as Record<string, string>;
}

describe('RealtimeSession', () => {
  it('subscribes exactly once and waits for stream readiness', async () => {
    const socket = new FakeSocket();
    const session = makeSession(socket);
    const connecting = session.connect();
    await waitUntil(() => socket.sentText.length === 1);

    expect(socket.connectCalls).toBe(1);
    expect(socket.sentText).toHaveLength(1);
    const payload = decodeJson(socket.sentText[0]);
    expect(payload.type).toBe('task_info');
    expect(payload.tasktoken).toBe('task-token');

    socket.emitText('{"type":"task_stream_ready"}');
    await connecting;
    void session.connect();

    expect(session.isReady).toBe(true);
    expect(socket.connectCalls).toBe(1);
    expect(socket.sentText).toHaveLength(1);
    await session.close();
  });

  it('emits output and unknown events after ready', async () => {
    const socket = new FakeSocket();
    const session = makeSession(socket);
    const events: RealtimeEvent[] = [];
    session.addEventListener(event => events.push(event));

    const connecting = session.connect();
    await waitUntil(() => socket.sentText.length === 1);
    socket.emitText('{"type":"task_stream_ready"}');
    socket.emitText(
      '{"type":"task_output","message":"TRANSCRIPT_USER:Hi"}',
    );
    socket.emitText('{"type":"task_future_event"}');
    await connecting;

    expect(events).toContainEqual(RealtimeEvent.output('TRANSCRIPT_USER:Hi'));
    expect(events).toContainEqual(RealtimeEvent.unknown('task_future_event'));
    await session.close();
  });

  it('prefixes PCM audio with the task token', async () => {
    const socket = new FakeSocket();
    const session = makeSession(socket);
    await connectReady(session, socket);

    const sent = session.sendAudio(new Uint8Array([1, 2, 3]));

    expect(sent).toBe(true);
    expect(socket.sentBinary[0]).toEqual(
      new Uint8Array([...toBytes('task-token|'), 1, 2, 3]),
    );
    await session.close();
  });

  it('strips and validates the token from server audio', async () => {
    const socket = new FakeSocket();
    const session = makeSession(socket);
    const events: RealtimeEvent[] = [];
    session.addEventListener(event => events.push(event));
    await connectReady(session, socket);

    socket.emit({
      kind: 'binary',
      bytes: new Uint8Array([...toBytes('task-token|'), 1, 2, 3]),
    });

    const binary = events
      .filter(event => event.kind === 'binary')
      .map(event => (event.kind === 'binary' ? event.bytes : null));
    expect(binary).toHaveLength(1);
    expect(binary[0]).toEqual(new Uint8Array([1, 2, 3]));
    expect(session.metrics.framesProcessed).toBe(2);
    expect(session.metrics.binaryFrames).toBe(1);
    expect(session.metrics.malformedFrames).toBe(0);
    await session.close();
  });

  it('accepts server audio prefixed with the task id', async () => {
    const socket = new FakeSocket();
    const session = makeSession(socket);
    const events: RealtimeEvent[] = [];
    session.addEventListener(event => events.push(event));
    await connectReady(session, socket);

    socket.emit({
      kind: 'binary',
      bytes: new Uint8Array([...toBytes('2743770|'), 4, 5, 6]),
    });

    const binary = events
      .filter(event => event.kind === 'binary')
      .map(event => (event.kind === 'binary' ? event.bytes : null));
    expect(binary).toHaveLength(1);
    expect(binary[0]).toEqual(new Uint8Array([4, 5, 6]));
    await session.close();
  });

  it('closes idempotently on postprocess completion', async () => {
    const socket = new FakeSocket();
    const session = makeSession(socket);
    await connectReady(session, socket);

    socket.emitText('{"type":"task_postprocess_end"}');
    await waitUntil(() => session.isClosed);
    await session.close();

    expect(session.isClosed).toBe(true);
    expect(socket.closeCalls).toBe(1);
  });

  it('keeps the session alive on a task-error log frame', async () => {
    const socket = new FakeSocket();
    const session = makeSession(socket);
    const events: RealtimeEvent[] = [];
    session.addEventListener(event => events.push(event));
    await connectReady(session, socket);

    socket.emitText(
      '{"type":"task_error","message":"private server detail"}',
    );

    expect(session.isReady).toBe(true);
    expect(session.isClosed).toBe(false);
    expect(events).toContainEqual(RealtimeEvent.error('task_error'));
    await session.close();
  });

  it('maps server cancellation before stream readiness', async () => {
    const socket = new FakeSocket();
    const session = makeSession(socket);

    const connecting = session.connect();
    await waitUntil(() => socket.sentText.length === 1);
    socket.emitText('{"type":"task_cancel"}');

    await expect(connecting).rejects.toBe(WiroFailure.Cancelled);
    await waitUntil(() => session.isClosed);
    expect(session.isClosed).toBe(true);
    expect(socket.closeCalls).toBe(1);
  });

  it('sends task_session_end once during an early stop', async () => {
    const socket = new FakeSocket();
    const session = makeSession(socket);
    await connectReady(session, socket);

    await session.stop();
    await session.stop();

    const frames = socket.sentText.map(decodeJson);
    const ends = frames.filter(frame => frame.type === 'task_session_end');
    expect(ends).toHaveLength(1);
    expect(frames[frames.length - 1].type).toBe('task_session_end');
    expect(frames[frames.length - 1].tasktoken).toBe('task-token');
  });

  it('closes when stream readiness times out', async () => {
    const socket = new FakeSocket();
    const session = makeSession(socket, 20);

    let error: unknown;
    try {
      await session.connect();
    } catch (thrown) {
      error = thrown;
    }

    expect(error).toBe(WiroFailure.StreamReadyTimeout);
    expect(session.isClosed).toBe(true);
    expect(socket.closeCalls).toBe(1);
  });

  it('does not reconnect after a remote disconnect', async () => {
    const socket = new FakeSocket();
    const session = makeSession(socket);
    await connectReady(session, socket);

    socket.finish();
    await waitUntil(() => session.isClosed);

    void session.connect();

    expect(socket.connectCalls).toBe(1);
    expect(session.isClosed).toBe(true);
  });
});

function toBytes(text: string): number[] {
  return Array.from(text).map(char => char.charCodeAt(0));
}
