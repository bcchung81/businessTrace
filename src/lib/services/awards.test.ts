import { describe, expect, it } from "vitest";
import { computeAwards, gradeOf, toSelectionInputs, EXCELLENT_TOP_N, type AwardRecord } from "@/lib/services/awards";
import type { BenchmarkRow } from "@/lib/services/benchmarking";

function record(companyId: number, name: string, period: string, total: number, rank: number): AwardRecord {
  return { companyId, companyName: name, period, total, rank };
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
  it("freezes ranked rows for the asked period and drops companies without a total", () => {
    const inputs = toSelectionInputs(
      [benchmarkRow(1, "가", 0.7, 1), benchmarkRow(2, "나", null, null)],
      { year: 2026, period: "2026-H2", formulaVersion: "rank-v1", decidedBy: 7 },
    );

    expect(inputs).toEqual([
      { companyId: 1, year: 2026, period: "2026-H2", grade: "우수", total: 0.7, rank: 1, metrics: [], formulaVersion: "rank-v1", decidedBy: 7 },
    ]);
  });
});

describe("computeAwards", () => {
  it("finds a company excellent three yearly periods in a row", () => {
    const records = [record(1, "가", "2024", 0.6, 3), record(1, "가", "2025", 0.62, 2), record(1, "가", "2026", 0.61, 4), record(2, "나", "2026", 0.9, 1)];
    const [threeYear] = computeAwards(records, "2026");

    expect(threeYear.id).toBe("three_year_excellent");
    expect(threeYear.label).toBe("3년 연속 우수");
    expect(threeYear.winners.map((winner) => winner.companyName)).toEqual(["가"]);
  });

  it("walks half-year chains across the year boundary and labels in 기 단위", () => {
    const records = [record(1, "가", "2025-H2", 0.5, 2), record(1, "가", "2026-H1", 0.55, 3), record(1, "가", "2026-H2", 0.6, 1)];
    const categories = computeAwards(records, "2026-H2");
    const [streak] = categories;

    expect(streak.label).toBe("3기 연속 우수");
    expect(streak.winners.map((winner) => winner.companyName)).toEqual(["가"]);
    expect(categories.find((c) => c.id === "top_growth")!.label).toBe("전기 대비 최다 성장");
  });

  it("awards the biggest period-over-period total growth", () => {
    const records = [
      record(1, "가", "2025", 0.5, 2),
      record(1, "가", "2026", 0.55, 3),
      record(2, "나", "2025", 0.4, 3),
      record(2, "나", "2026", 0.7, 1),
    ];
    const growth = computeAwards(records, "2026").find((category) => category.id === "top_growth")!;

    expect(growth.label).toBe("전년 대비 최다 성장");
    expect(growth.winners).toEqual([{ companyId: 2, companyName: "나", detail: "+0.30 (0.40 → 0.70)" }]);
  });

  it("awards the best score among companies first recorded in the target period", () => {
    const records = [record(1, "가", "2025", 0.5, 1), record(1, "가", "2026", 0.9, 1), record(2, "나", "2026", 0.6, 2), record(3, "다", "2026", 0.4, 3)];
    const newcomer = computeAwards(records, "2026").find((category) => category.id === "best_newcomer")!;

    expect(newcomer.winners.map((winner) => winner.companyName)).toEqual(["나"]);
  });

  it("keeps every category present with empty winners when nothing qualifies", () => {
    const categories = computeAwards([], "2026");

    expect(categories.map((category) => category.id)).toEqual(["three_year_excellent", "top_growth", "best_newcomer"]);
    expect(categories.every((category) => category.winners.length === 0)).toBe(true);
  });
});
