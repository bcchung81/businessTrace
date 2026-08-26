import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/services/password";

const WERKZEUG_HASH =
  "scrypt:32768:8:1$ec0nuGbPFNfB6dL1$3a3ba38d772aab916d76439e6e5edd91b9eb1e8d6c6919b2090b688484d23d18643a0d2ec9d86dac2501757eb031723597239e3bcbbb41596c21513588fa729b";

describe("verifyPassword", () => {
  it("accepts the password behind a hash produced by werkzeug", async () => {
    expect(await verifyPassword("Passw0rd!", WERKZEUG_HASH)).toBe(true);
  });

  it("rejects a wrong password against the same werkzeug hash", async () => {
    expect(await verifyPassword("wrong", WERKZEUG_HASH)).toBe(false);
  });

  it("rejects a hash produced by a different algorithm", async () => {
    expect(await verifyPassword("Passw0rd!", "pbkdf2:sha256:600000$salt$deadbeef")).toBe(false);
  });

  it("rejects a malformed hash instead of throwing", async () => {
    expect(await verifyPassword("Passw0rd!", "not-a-hash")).toBe(false);
    expect(await verifyPassword("Passw0rd!", "")).toBe(false);
  });
});

describe("hashPassword", () => {
  it("writes the werkzeug format so migrated and new users share one column", async () => {
    const stored = await hashPassword("Secret123!");

    expect(stored).toMatch(/^scrypt:32768:8:1\$[A-Za-z0-9]{16}\$[0-9a-f]{128}$/);
  });

  it("round-trips through verifyPassword", async () => {
    const stored = await hashPassword("Secret123!");

    expect(await verifyPassword("Secret123!", stored)).toBe(true);
    expect(await verifyPassword("Secret123", stored)).toBe(false);
  });

  it("uses a fresh salt for every call", async () => {
    const [a, b] = await Promise.all([hashPassword("same"), hashPassword("same")]);

    expect(a).not.toBe(b);
  });
});
