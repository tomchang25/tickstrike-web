export interface RateLimiterOptions {
  /** Millisecond clock; injected so tests advance time deterministically. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/**
 * A pure per-key sliding-window limiter. It owns no audio state: callers ask whether a keyed request
 * may proceed, and the limiter records allowed requests and prunes those that have aged out of the
 * window. An absent or empty key is the caller's signal to skip limiting entirely, so this class is
 * only consulted for keyed cues.
 */
export class RateLimiter {
  private readonly history = new Map<string, number[]>();
  private readonly now: () => number;

  constructor(options: RateLimiterOptions = {}) {
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Records and allows the request, or returns false when `key` already has `maxPerWindow` allowed
   * requests inside the trailing `windowSec`. A non-positive `maxPerWindow` rejects unconditionally.
   */
  tryAcquire(key: string, maxPerWindow: number, windowSec: number): boolean {
    if (maxPerWindow <= 0) {
      return false;
    }

    const now = this.now();
    const windowMs = Math.max(0, windowSec) * 1000;
    const kept = (this.history.get(key) ?? []).filter((stamp) => now - stamp <= windowMs);

    if (kept.length >= maxPerWindow) {
      this.history.set(key, kept);
      return false;
    }

    kept.push(now);
    this.history.set(key, kept);
    return true;
  }

  clear(): void {
    this.history.clear();
  }
}
