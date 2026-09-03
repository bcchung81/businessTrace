import { beforeEach, describe, expect, it } from "vitest";
import { EMAIL_ATTEMPTS, IP_ATTEMPTS, checkLoginAttempt } from "@/lib/services/loginThrottle";
import { resetRateLimits } from "@/lib/services/rateLimit";

const at = (now: number) => ({ ip: "203.0.113.9", email: "a@b.kr", now });

describe("checkLoginAttempt", () => {
  beforeEach(resetRateLimits);

  it("lets an ordinary sign-in through", () => {
    expect(checkLoginAttempt(at(0))).toEqual({ ok: true });
  });

  it("stops brute force on one account", () => {
    for (let attempt = 0; attempt < EMAIL_ATTEMPTS; attempt += 1) checkLoginAttempt(at(0));

    const blocked = checkLoginAttempt(at(0));
    expect(blocked.ok).toBe(false);
    expect(blocked.ok === false && blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("stops one address spraying many accounts", () => {
    for (let attempt = 0; attempt < IP_ATTEMPTS; attempt += 1) {
      checkLoginAttempt({ ip: "203.0.113.9", email: `user${attempt}@b.kr`, now: 0 });
    }

    expect(checkLoginAttempt({ ip: "203.0.113.9", email: "fresh@b.kr", now: 0 }).ok).toBe(false);
  });

  it("keeps a different address unaffected", () => {
    for (let attempt = 0; attempt < IP_ATTEMPTS; attempt += 1) {
      checkLoginAttempt({ ip: "203.0.113.9", email: `user${attempt}@b.kr`, now: 0 });
    }

    expect(checkLoginAttempt({ ip: "198.51.100.4", email: "user1@b.kr", now: 0 }).ok).toBe(true);
  });

  it("treats the email case-insensitively — otherwise A@b.kr resets the counter", () => {
    for (let attempt = 0; attempt < EMAIL_ATTEMPTS; attempt += 1) checkLoginAttempt(at(0));

    expect(checkLoginAttempt({ ip: "203.0.113.9", email: "A@B.KR", now: 0 }).ok).toBe(false);
  });

  it("opens again once the window passes", () => {
    for (let attempt = 0; attempt < EMAIL_ATTEMPTS; attempt += 1) checkLoginAttempt(at(0));

    expect(checkLoginAttempt(at(5 * 60_000 + 1)).ok).toBe(true);
  });
});
