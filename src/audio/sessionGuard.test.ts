import { RealtimeSessionGuard, RealtimeSessionOwner } from './sessionGuard';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(() => resolve(), ms));
}

describe('RealtimeSessionGuard', () => {
  it('allows one lease and rejects parallel sessions', () => {
    const guard = new RealtimeSessionGuard();
    const conversation = guard.acquire(RealtimeSessionOwner.Conversation);
    const transcription = guard.acquire(RealtimeSessionOwner.Transcription);

    expect(conversation).not.toBeNull();
    expect(transcription).toBeNull();
    expect(guard.currentLease).toBe(conversation);
    guard.dispose();
  });

  it('lets only the current lease release the guard', () => {
    const guard = new RealtimeSessionGuard();
    const first = guard.acquire(RealtimeSessionOwner.Speech);
    guard.release(first);
    const second = guard.acquire(RealtimeSessionOwner.Speech);

    guard.release(first);

    expect(guard.currentLease).toBe(second);
    guard.dispose();
  });

  it('acquires immediately when nothing is held', async () => {
    const guard = new RealtimeSessionGuard();
    const lease = await guard.acquireWhenFree(RealtimeSessionOwner.Conversation);

    expect(lease).not.toBeNull();
    expect(guard.currentLease).toBe(lease);
    guard.dispose();
  });

  it('waits out the departing session', async () => {
    const guard = new RealtimeSessionGuard();
    const departing = guard.acquire(RealtimeSessionOwner.Conversation);

    const pending = guard.acquireWhenFree(RealtimeSessionOwner.Transcription);
    await delay(20);
    guard.release(departing);

    const lease = await pending;
    expect(lease?.owner).toBe(RealtimeSessionOwner.Transcription);
    expect(guard.currentLease).toBe(lease);
    guard.dispose();
  });

  it('gives up once nothing lets go before the timeout', async () => {
    const guard = new RealtimeSessionGuard();
    guard.acquire(RealtimeSessionOwner.Conversation);

    const lease = await guard.acquireWhenFree(RealtimeSessionOwner.Speech, 20);

    expect(lease).toBeNull();
    guard.dispose();
  });

  it('wakes a pending acquireWhenFree with null on disposal', async () => {
    const guard = new RealtimeSessionGuard();
    guard.acquire(RealtimeSessionOwner.Conversation);
    const pending = guard.acquireWhenFree(RealtimeSessionOwner.Speech);
    await delay(20);
    guard.dispose();

    expect(await pending).toBeNull();
  });

  it('ignores an asynchronous release after disposal', () => {
    const guard = new RealtimeSessionGuard();
    const lease = guard.acquire(RealtimeSessionOwner.Conversation);

    guard.dispose();
    guard.release(lease);

    expect(guard.acquire(RealtimeSessionOwner.Transcription)).toBeNull();
  });
});
