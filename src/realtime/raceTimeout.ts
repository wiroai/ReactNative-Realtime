export type RaceTimeoutResult<T> =
  | { readonly timedOut: true }
  | { readonly timedOut: false; readonly value: T };

/**
 * Bounds `promise` to `timeoutMs`, ported from Kotlin's
 * `withTimeoutOrNull`.
 *
 * A `promise` that rejects after the timeout already won would
 * otherwise surface as an unhandled rejection; the no-op `catch`
 * below keeps it observed without changing what `race` sees.
 */
export async function raceTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<RaceTimeoutResult<T>> {
  promise.catch(() => {});
  let timer!: ReturnType<typeof setTimeout>;
  const timedOutPromise = new Promise<RaceTimeoutResult<T>>(resolve => {
    timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
  });
  try {
    return await Promise.race([
      promise.then(value => ({ timedOut: false as const, value })),
      timedOutPromise,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
