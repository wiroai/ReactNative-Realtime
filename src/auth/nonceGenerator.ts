export type WiroNonceGenerator = () => string;

/**
 * Monotonic microsecond-ish nonce, ported from
 * `MonotonicWiroNonceGenerator`.
 *
 * JS has no shared-memory threads, so the atomic compare-and-swap
 * loop collapses to a plain closure.
 */
export function createMonotonicNonceGenerator(
  microsecondsSinceEpoch: () => number = () => Date.now() * 1_000,
): WiroNonceGenerator {
  let lastValue = 0;
  return () => {
    const timestamp = microsecondsSinceEpoch();
    const next = timestamp > lastValue ? timestamp : lastValue + 1;
    lastValue = next;
    return String(next);
  };
}
