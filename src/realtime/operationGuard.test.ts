import { RealtimeOperationGuard } from './operationGuard';

describe('RealtimeOperationGuard', () => {
  it('issues increasing ids and reports only the latest as current', () => {
    const guard = new RealtimeOperationGuard();

    const first = guard.begin();
    const second = guard.begin();

    expect(second).toBeGreaterThan(first);
    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
    expect(guard.current).toBe(second);
  });

  it('invalidates every operation once disposed', () => {
    const guard = new RealtimeOperationGuard();
    const operationId = guard.begin();

    guard.dispose();

    expect(guard.isDisposed).toBe(true);
    expect(guard.isCurrent(operationId)).toBe(false);
  });
});
