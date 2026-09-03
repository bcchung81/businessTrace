import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { createAdminAccount } from "@/lib/services/adminAccount";
import { verifyPassword } from "@/lib/services/password";

describe("createAdminAccount", () => {
  beforeEach(resetDatabase);

  it("creates an account the login flow can then authenticate", async () => {
    const result = await createAdminAccount({ email: "admin@kca.kr", password: "Passw0rd!Long1" });

    expect(result).toMatchObject({ ok: true, email: "admin@kca.kr" });
    const stored = await prisma.user.findUniqueOrThrow({ where: { email: "admin@kca.kr" } });
    expect(await verifyPassword("Passw0rd!Long1", stored.passwordHash)).toBe(true);
    expect(stored.isActive).toBe(true);
  });

  it("normalises the email the same way the login flow does", async () => {
    await createAdminAccount({ email: "  Admin@KCA.kr  ", password: "Passw0rd!Long1" });

    expect(await prisma.user.findUnique({ where: { email: "admin@kca.kr" } })).not.toBeNull();
  });

  it("refuses a duplicate email instead of overwriting an existing account", async () => {
    await createAdminAccount({ email: "admin@kca.kr", password: "Passw0rd!Long1" });

    const result = await createAdminAccount({ email: "admin@kca.kr", password: "Different1!Long" });

    expect(result).toEqual({ ok: false, message: "이미 등록된 이메일입니다." });
    const stored = await prisma.user.findUniqueOrThrow({ where: { email: "admin@kca.kr" } });
    expect(await verifyPassword("Passw0rd!Long1", stored.passwordHash)).toBe(true);
  });

  it("refuses a weak password and creates nothing", async () => {
    const result = await createAdminAccount({ email: "admin@kca.kr", password: "short" });

    expect(result).toEqual({ ok: false, message: "비밀번호는 최소 12자 이상이어야 합니다." });
    expect(await prisma.user.count()).toBe(0);
  });

  it("refuses a malformed email and creates nothing", async () => {
    const result = await createAdminAccount({ email: "not-an-email", password: "Passw0rd!Long1" });

    expect(result).toEqual({ ok: false, message: "올바른 이메일 형식이 아닙니다." });
    expect(await prisma.user.count()).toBe(0);
  });

  it("never returns the password hash", async () => {
    const result = await createAdminAccount({ email: "admin@kca.kr", password: "Passw0rd!Long1" });

    expect(result).not.toHaveProperty("passwordHash");
  });
});
