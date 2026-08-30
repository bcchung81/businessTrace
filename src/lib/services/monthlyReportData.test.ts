import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { loadMonthlyReportInput, monthRange } from "@/lib/services/monthlyReportData";

describe("monthRange", () => {
  it("computes the calendar month boundary in KST, expressed as UTC", () => {
    const { since, until } = monthRange(2026, 8);
    expect(since.toISOString()).toBe("2026-07-31T15:00:00.000Z");
    expect(until.toISOString()).toBe("2026-08-31T14:59:59.999Z");
  });
});

describe("loadMonthlyReportInput", () => {
  beforeEach(resetDatabase);

  it("filters the cohort by Company.year and the window by calendar month, independently", async () => {
    const company = await prisma.company.create({ data: { name: "가", year: 2025 } });
    await prisma.event.create({
      data: {
        companyId: company.id,
        kind: "award",
        severity: "positive",
        occurredAt: new Date("2026-08-10T00:00:00.000Z"),
        title: "수상 — 대상",
        evidenceKey: "https://n/1",
        evidenceJson: JSON.stringify([{ label: "대상", link: "https://n/1" }]),
      },
    });

    const august = await loadMonthlyReportInput({ cohortYear: 2025, year: 2026, month: 8 });
    expect(august.events).toHaveLength(1);
    expect(august.events[0].companyName).toBe("가");
    expect(august.cards.map((card) => card.name)).toContain("가");

    const july = await loadMonthlyReportInput({ cohortYear: 2025, year: 2026, month: 7 });
    expect(july.events).toHaveLength(0);
  });
});
