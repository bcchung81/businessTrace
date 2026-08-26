import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";

describe("Company schema", () => {
  beforeEach(resetDatabase);

  it("allows the same company name in different years", async () => {
    await prisma.company.create({ data: { name: "넷록스", year: 2024 } });
    const second = await prisma.company.create({ data: { name: "넷록스", year: 2025 } });

    expect(second.year).toBe(2025);
  });

  it("rejects a duplicate name within the same year", async () => {
    await prisma.company.create({ data: { name: "넷록스", year: 2024 } });

    await expect(prisma.company.create({ data: { name: "넷록스", year: 2024 } })).rejects.toThrow();
  });

  it("defaults businessNo and industry to null so DART lookup can fill them later", async () => {
    const created = await prisma.company.create({ data: { name: "논스랩", year: 2024 } });

    expect(created.businessNo).toBeNull();
    expect(created.industry).toBeNull();
  });
});
