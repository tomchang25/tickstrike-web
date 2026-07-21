import { describe, expect, it } from "vitest";
import { RateLimiter } from "@presentation/audio/rate-limiter";

describe("RateLimiter", () => {
  it("allows up to maxPerWindow requests then rejects within the window", () => {
    let now = 0;
    const limiter = new RateLimiter({ now: () => now });

    expect(limiter.tryAcquire("hit", 2, 1)).toBe(true);
    expect(limiter.tryAcquire("hit", 2, 1)).toBe(true);
    expect(limiter.tryAcquire("hit", 2, 1)).toBe(false);
  });

  it("prunes timestamps that have aged past the window", () => {
    let now = 0;
    const limiter = new RateLimiter({ now: () => now });

    expect(limiter.tryAcquire("hit", 1, 0.5)).toBe(true);
    now = 200;
    expect(limiter.tryAcquire("hit", 1, 0.5)).toBe(false);

    now = 600;
    expect(limiter.tryAcquire("hit", 1, 0.5)).toBe(true);
  });

  it("tracks keys independently", () => {
    let now = 0;
    const limiter = new RateLimiter({ now: () => now });

    expect(limiter.tryAcquire("a", 1, 1)).toBe(true);
    expect(limiter.tryAcquire("b", 1, 1)).toBe(true);
    expect(limiter.tryAcquire("a", 1, 1)).toBe(false);
  });

  it("rejects unconditionally when maxPerWindow is not positive", () => {
    const limiter = new RateLimiter({ now: () => 0 });
    expect(limiter.tryAcquire("hit", 0, 1)).toBe(false);
  });

  it("forgets all history on clear", () => {
    let now = 0;
    const limiter = new RateLimiter({ now: () => now });

    expect(limiter.tryAcquire("hit", 1, 1)).toBe(true);
    limiter.clear();
    expect(limiter.tryAcquire("hit", 1, 1)).toBe(true);
  });
});
