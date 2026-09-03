import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { isActiveUser } from "@/lib/services/activeUser";

describe("isActiveUser", () => {
  beforeEach(resetDatabase);

  it("accepts a live account", async () => {
    const user = await prisma.user.create({ data: { email: "live@example.com", passwordHash: "x" } });

    expect(await isActiveUser(String(user.id))).toBe(true);
  });

  it("rejects an account deactivated after its token was signed", async () => {
    const user = await prisma.user.create({ data: { email: "gone@example.com", passwordHash: "x", isActive: false } });

    expect(await isActiveUser(String(user.id))).toBe(false);
  });

  it("rejects an id that no longer exists", async () => {
    expect(await isActiveUser("9999")).toBe(false);
  });

  it.each(["", "abc", "0", "-1", "1.5", "1; DROP TABLE User"])("rejects %o without querying", async (id) => {
    expect(await isActiveUser(id)).toBe(false);
  });
});
