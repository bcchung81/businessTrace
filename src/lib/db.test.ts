import { describe, it, expect } from "vitest";
import { enableWal, prisma } from "@/lib/db";

describe("prisma client", () => {
  it("connects to the database and reads the users table", async () => {
    const count = await prisma.user.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

describe("enableWal", () => {
  it("switches the database file to write-ahead logging and reports the mode", async () => {
    expect(await enableWal(prisma)).toBe("wal");
    const [row] = await prisma.$queryRawUnsafe<{ journal_mode: string }[]>("PRAGMA journal_mode");
    expect(row.journal_mode).toBe("wal");
  });
});
