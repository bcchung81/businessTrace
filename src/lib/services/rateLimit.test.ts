import { beforeEach, describe, expect, it } from "vitest";
import { hitRateLimit, resetRateLimits } from "@/lib/services/rateLimit";

const window = { limit: 3, windowMs: 60_000 };

describe("hitRateLimit", () => {
  beforeEach(resetRateLimits);

  it("allows attempts up to the limit", () => {
    const now = 1_000;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      expect(hitRateLimit("a", { ...window, now })).toEqual({ allowed: true, retryAfterMs: 0 });
    }
  });

  it("blocks the attempt after the limit and says how long to wait", () => {
    for (let attempt = 1; attempt <= 3; attempt += 1) hitRateLimit("a", { ...window, now: 1_000 });

    expect(hitRateLimit("a", { ...window, now: 21_000 })).toEqual({ allowed: false, retryAfterMs: 40_000 });
  });

  it("forgets attempts that fell out of the window", () => {
    for (let attempt = 1; attempt <= 3; attempt += 1) hitRateLimit("a", { ...window, now: 1_000 });

    expect(hitRateLimit("a", { ...window, now: 61_001 }).allowed).toBe(true);
  });

  it("counts each key on its own", () => {
    for (let attempt = 1; attempt <= 3; attempt += 1) hitRateLimit("a", { ...window, now: 1_000 });

    expect(hitRateLimit("b", { ...window, now: 1_000 }).allowed).toBe(true);
  });

  it("drops keys whose windows have expired so the map cannot grow without bound", () => {
    for (let index = 0; index < 50; index += 1) hitRateLimit(`k${index}`, { ...window, now: 1_000 });

    hitRateLimit("late", { ...window, now: 10_000_000 });

    expect(hitRateLimit("k0", { ...window, now: 10_000_000 }).allowed).toBe(true);
    expect(resetRateLimits(), "낡은 키 50개는 지워지고 방금 쓴 둘만 남는다").toBe(2);
  });
});
