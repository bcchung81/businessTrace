import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";

describe("Event schema", () => {
  beforeEach(resetDatabase);

  it("stores one event per company, kind and evidence key", async () => {
    const company = await prisma.company.create({ data: { name: "딥노이드", year: 2025 } });
    const data = {
      companyId: company.id, kind: "award", severity: "positive", occurredAt: new Date("2026-08-26"),
      title: "식약처 허가", evidenceKey: "https://n/1", evidenceJson: "[]",
    };
    await prisma.event.create({ data });

    await expect(prisma.event.create({ data })).rejects.toThrow();
    expect(await prisma.event.count()).toBe(1);
  });

  it("defaults status to open and keeps trust nullable", async () => {
    const company = await prisma.company.create({ data: { name: "딥노이드", year: 2025 } });
    const saved = await prisma.event.create({
      data: { companyId: company.id, kind: "headcount_down", severity: "notice", occurredAt: new Date(), title: "t", evidenceKey: "202607", evidenceJson: "[]" },
    });

    expect(saved.status).toBe("open");
    expect(saved.trust).toBeNull();
  });
});
