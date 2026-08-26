import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";

describe("prisma client", () => {
  it("connects to the database and reads the users table", async () => {
    const count = await prisma.user.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
