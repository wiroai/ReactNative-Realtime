import { SessionElapsedClock } from './elapsedClock';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(() => resolve(), ms));
}

describe('SessionElapsedClock', () => {
  it('reports elapsed time on a fixed cadence', async () => {
    const clock = new SessionElapsedClock(10);
    const ticks: number[] = [];

    clock.start(elapsed => ticks.push(elapsed));
    await delay(35);
    clock.stop();

    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
    expect(ticks[0]).toBe(10);
  });

  it('replaces a previous run instead of layering timers', async () => {
    const clock = new SessionElapsedClock(10);
    const first: number[] = [];
    const second: number[] = [];

    clock.start(elapsed => first.push(elapsed));
    clock.start(elapsed => second.push(elapsed));
    await delay(25);
    clock.stop();

    expect(first).toEqual([]);
    expect(second.length).toBeGreaterThan(0);
  });

  it('stops emitting once stopped', async () => {
    const clock = new SessionElapsedClock(10);
    const ticks: number[] = [];
    clock.start(elapsed => ticks.push(elapsed));
    await delay(15);

    clock.stop();
    const countAtStop = ticks.length;
    await delay(25);

    expect(ticks.length).toBe(countAtStop);
    expect(clock.isRunning).toBe(false);
  });
});
