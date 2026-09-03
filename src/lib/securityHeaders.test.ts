import { describe, expect, test } from "vitest";
import { SECURITY_HEADERS } from "@/lib/securityHeaders";

const value = (key: string) => SECURITY_HEADERS.find((header) => header.key === key)?.value;

describe("SECURITY_HEADERS", () => {
  test.each([
    ["X-Content-Type-Options", "nosniff"],
    ["X-Frame-Options", "DENY"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ])("%s is %s", (key, expected) => {
    expect(value(key)).toBe(expected);
  });

  test("locks down framing, base tags and form targets", () => {
    const csp = value("Content-Security-Policy") ?? "";

    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  test("carries no script or style directive — those would kill the app until a nonce pass lands", () => {
    const csp = value("Content-Security-Policy") ?? "";

    expect(csp).not.toMatch(/default-src|script-src|style-src|font-src|connect-src|img-src/);
  });

  test("asks browsers to keep using https once they have seen it", () => {
    expect(value("Strict-Transport-Security")).toMatch(/max-age=\d{7,}/);
  });
});
