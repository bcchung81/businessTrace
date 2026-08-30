import { describe, expect, it } from "vitest";
import type { SelectionRow } from "@/lib/repositories/selectionRecord";
import { computeAwards, gradeOf, toSelectionInputs, EXCELLENT_TOP_N } from "@/lib/services/awards";
import type { BenchmarkRow } from "@/lib/services/benchmarking";

function record(companyId: number, name: string, year: number, total: number, rank: number): SelectionRow {
  return { companyId, companyName: name, year, grade: gradeOf(rank), total, rank, metrics: [], formulaVersion: "rank-v1", decidedAt: "2026-09-01T00:00:00.000Z", decidedBy: 1 };
}

function benchmarkRow(companyId: number, name: string, total: number | null, rank: number | null): BenchmarkRow {
  return { companyId, name, industry: null, rubricId: "default", rubricName: "기본", metrics: [], riskPenalty: 0, total, rank };
}

describe("gradeOf", () => {
  it("grades the top ten as 우수 and the rest as 선정", () => {
    expect(gradeOf(1)).toBe("우수");
    expect(gradeOf(EXCELLENT_TOP_N)).toBe("우수");
    expect(gradeOf(EXCELLENT_TOP_N + 1)).toBe("선정");
    expect(gradeOf(null)).toBe("선정");
  });
});

describe("toSelectionInputs", () => {
  it("freezes ranked rows and drops companies without a total", () => {
    const inputs = toSelectionInputs(
      [benchmarkRow(1, "가", 0.7, 1), benchmarkRow(2, "나", null, null)],
      { year: 2026, formulaVersion: "rank-v1", decidedBy: 7 },
    );

    expect(inputs).toEqual([
      { companyId: 1, year: 2026, grade: "우수", total: 0.7, rank: 1, metrics: [], formulaVersion: "rank-v1", decidedBy: 7 },
    ]);
  });
});

describe("computeAwards", () => {
  it("finds a company excellent three years in a row", () => {
    const records = [record(1, "가", 2024, 0.6, 3), record(1, "가", 2025, 0.62, 2), record(1, "가", 2026, 0.61, 4), record(2, "나", 2026, 0.9, 1)];
    const [threeYear] = computeAwards(records, 2026);

    expect(threeYear.id).toBe("three_year_excellent");
    expect(threeYear.winners.map((winner) => winner.companyName)).toEqual(["가"]);
  });

  it("awards the biggest year-over-year total growth", () => {
    const records = [
      record(1, "가", 2025, 0.5, 2),
      record(1, "가", 2026, 0.55, 3),
      record(2, "나", 2025, 0.4, 3),
      record(2, "나", 2026, 0.7, 1),
    ];
    const growth = computeAwards(records, 2026).find((category) => category.id === "top_growth")!;

    expect(growth.winners).toEqual([{ companyId: 2, companyName: "나", detail: "+0.30 (0.40 → 0.70)" }]);
  });

  it("awards the best score among companies first recorded in the target year", () => {
    const records = [record(1, "가", 2025, 0.5, 1), record(1, "가", 2026, 0.9, 1), record(2, "나", 2026, 0.6, 2), record(3, "다", 2026, 0.4, 3)];
    const newcomer = computeAwards(records, 2026).find((category) => category.id === "best_newcomer")!;

    expect(newcomer.winners.map((winner) => winner.companyName)).toEqual(["나"]);
  });

  it("keeps every category present with empty winners when nothing qualifies", () => {
    const categories = computeAwards([], 2026);

    expect(categories.map((category) => category.id)).toEqual(["three_year_excellent", "top_growth", "best_newcomer"]);
    expect(categories.every((category) => category.winners.length === 0)).toBe(true);
  });
});
