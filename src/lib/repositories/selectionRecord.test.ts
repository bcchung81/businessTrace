import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { listSelections, listSelectionYears, saveSelections } from "@/lib/repositories/selectionRecord";
import type { MetricScore } from "@/lib/services/benchmarking";

const METRICS: MetricScore[] = [{ key: "sentiment", raw: 5, normalised: 0.8, weight: 0.25 }];

function input(companyId: number, over: Partial<Parameters<typeof saveSelections>[0][number]> = {}) {
  return { companyId, year: 2026, period: "2026", grade: "우수", total: 0.71, rank: 1, metrics: METRICS, formulaVersion: "rank-v1", decidedBy: 1, ...over };
}

describe("selectionRecord repository", () => {
  beforeEach(resetDatabase);

  it("saves one record per company and period, and re-deciding overwrites it", async () => {
    const company = await prisma.company.create({ data: { name: "딥노이드", year: 2026 } });
    expect(await saveSelections([input(company.id)])).toBe(1);
    await saveSelections([input(company.id, { total: 0.65, grade: "선정", rank: 11 })]);

    const rows = await listSelections({ year: 2026 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ companyName: "딥노이드", period: "2026", total: 0.65, grade: "선정", rank: 11, formulaVersion: "rank-v1" });
    expect(rows[0].metrics).toEqual(METRICS);
  });

  it("keeps half and quarter records of the same year side by side", async () => {
    const company = await prisma.company.create({ data: { name: "딥노이드", year: 2026 } });
    await saveSelections([
      input(company.id, { period: "2026-H1", total: 0.5 }),
      input(company.id, { period: "2026-H2", total: 0.6 }),
    ]);

    const rows = await listSelections({ year: 2026 });
    expect(rows.map((row) => [row.period, row.total])).toEqual([
      ["2026-H1", 0.5],
      ["2026-H2", 0.6],
    ]);
  });

  it("lists selections ordered by period then total, and years descending", async () => {
    const a = await prisma.company.create({ data: { name: "가", year: 2025 } });
    const b = await prisma.company.create({ data: { name: "나", year: 2025 } });
    await saveSelections([
      input(a.id, { year: 2025, period: "2025", total: 0.4, rank: 2, grade: "선정" }),
      input(b.id, { year: 2025, period: "2025", total: 0.9, rank: 1 }),
      input(a.id, { year: 2026, period: "2026", total: 0.6 }),
    ]);

    const rows = await listSelections();
    expect(rows.map((row) => [row.period, row.companyName])).toEqual([
      ["2025", "나"],
      ["2025", "가"],
      ["2026", "가"],
    ]);
    expect(await listSelectionYears()).toEqual([2026, 2025]);
  });
});
