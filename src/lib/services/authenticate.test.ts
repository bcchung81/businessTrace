import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { authenticateUser } from "@/lib/services/authenticate";

const LEGACY_HASH =
  "scrypt:32768:8:1$ec0nuGbPFNfB6dL1$3a3ba38d772aab916d76439e6e5edd91b9eb1e8d6c6919b2090b688484d23d18643a0d2ec9d86dac2501757eb031723597239e3bcbbb41596c21513588fa729b";

describe("authenticateUser", () => {
  beforeEach(resetDatabase);

  it("signs in a migrated user whose hash came from the Flask app", async () => {
    await prisma.user.create({ data: { email: "redscv@example.com", passwordHash: LEGACY_HASH } });

    const user = await authenticateUser({ email: "redscv@example.com", password: "Passw0rd!" });

    expect(user).toMatchObject({ email: "redscv@example.com" });
  });

  it("normalises the submitted email the way the Flask app stored it", async () => {
    await prisma.user.create({ data: { email: "redscv@example.com", passwordHash: LEGACY_HASH } });

    const user = await authenticateUser({ email: "  REDSCV@Example.com  ", password: "Passw0rd!" });

    expect(user).not.toBeNull();
  });

  it("rejects a wrong password", async () => {
    await prisma.user.create({ data: { email: "redscv@example.com", passwordHash: LEGACY_HASH } });

    expect(await authenticateUser({ email: "redscv@example.com", password: "nope" })).toBeNull();
  });

  it("rejects an unknown email", async () => {
    expect(await authenticateUser({ email: "ghost@example.com", password: "Passw0rd!" })).toBeNull();
  });

  it("rejects a deactivated account even with the right password", async () => {
    await prisma.user.create({
      data: { email: "gone@example.com", passwordHash: LEGACY_HASH, isActive: false },
    });

    expect(await authenticateUser({ email: "gone@example.com", password: "Passw0rd!" })).toBeNull();
  });

  it("rejects malformed input without touching the database", async () => {
    expect(await authenticateUser({ email: "not-an-email", password: "Passw0rd!" })).toBeNull();
    expect(await authenticateUser({ email: "redscv@example.com", password: "" })).toBeNull();
    expect(await authenticateUser({})).toBeNull();
  });

  it("never returns the password hash to the session layer", async () => {
    await prisma.user.create({ data: { email: "redscv@example.com", passwordHash: LEGACY_HASH } });

    const user = await authenticateUser({ email: "redscv@example.com", password: "Passw0rd!" });

    expect(user).not.toHaveProperty("passwordHash");
  });
});
