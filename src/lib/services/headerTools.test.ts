import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { loadHeaderTools, monthWindow } from "@/lib/services/headerTools";

describe("monthWindow", () => {
  test("counts months on the KST wall clock, so the last UTC hours of a month already belong to the next", () => {
    expect(monthWindow(new Date("2026-09-30T16:00:00Z"))).toEqual({ thisMonth: { year: 2026, month: 10 }, lastMonth: { year: 2026, month: 9 } });
  });

  test("steps back across a year boundary", () => {
    expect(monthWindow(new Date("2026-01-15T00:00:00Z"))).toEqual({ thisMonth: { year: 2026, month: 1 }, lastMonth: { year: 2025, month: 12 } });
  });
});

describe("loadHeaderTools", () => {
  beforeEach(resetDatabase);

  test("falls back to the current year with nothing pending when no company is registered", async () => {
    const now = new Date("2026-09-03T00:00:00Z");
    expect(await loadHeaderTools(now)).toEqual({ year: 2026, thisMonth: { year: 2026, month: 9 }, lastMonth: { year: 2026, month: 8 }, pendingIds: [] });
  });

  test("uses the latest cohort year and lists its unanalysed companies", async () => {
    await prisma.company.create({ data: { name: "옛기업", year: 2025 } });
    const fresh = await prisma.company.create({ data: { name: "새기업", year: 2026 } });
    const tools = await loadHeaderTools(new Date("2026-09-03T00:00:00Z"));
    expect(tools.year).toBe(2026);
    expect(tools.pendingIds).toEqual([fresh.id]);
  });
});
