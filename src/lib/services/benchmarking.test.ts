import { describe, expect, test } from "vitest";
import { loadRubrics, resolveRubric, weightLabel, METRIC_KEYS } from "@/lib/services/benchmarking";

describe("rubrics", () => {
  const book = loadRubrics();

  test("ships ICT, 제조, 바이오 and a default whose weights sum to 1", () => {
    expect(book.rubrics.map((r) => r.id)).toEqual(["ict", "manufacturing", "bio"]);
    for (const rubric of [book.default, ...book.rubrics]) {
      const sum = METRIC_KEYS.reduce((acc, key) => acc + rubric.weights[key], 0);
      expect(sum, rubric.id).toBeCloseTo(1, 6);
      expect(rubric.riskPenalty).toBeGreaterThan(0);
    }
  });

  test("default weights are the roadmap values", () => {
    expect(book.default.weights).toEqual({ sentiment: 0.3, award: 0.2, investment: 0.2, finance: 0.2, verification: 0.1 });
  });

  test("maps the cohort's industry names onto rubrics and falls back to default", () => {
    expect(resolveRubric("SW", book).id).toBe("ict");
    expect(resolveRubric("의료/헬스케어", book).id).toBe("bio");
    expect(resolveRubric("첨단로봇", book).id).toBe("manufacturing");
    expect(resolveRubric("응용 소프트웨어 개발 및 공급업", book).id).toBe("ict");
    expect(resolveRubric("시스템 소프트웨어 개발 및 공급업", book).id).toBe("ict");
    expect(resolveRubric("컴퓨터시스템 통합 자문 및 구축 서비스업", book).id).toBe("ict");
    expect(resolveRubric("ESG", book).id).toBe("default");
    expect(resolveRubric(null, book).id).toBe("default");
  });

  test("spells the weights out the way the screen shows them", () => {
    expect(weightLabel(book.default)).toBe("감성 0.3 · 수상 0.2 · 투자 0.2 · 재무 0.2 · 검증 0.1 · 리스크 감점");
  });
});

import { rankCompanies, type BenchmarkInput } from "@/lib/services/benchmarking";

function input(over: Partial<BenchmarkInput> & { companyId: number; name: string }): BenchmarkInput {
  return { industry: null, sentiment: null, awards: null, investments: null, revenue: null, verification: null, confirmedRisks: 0, ...over };
}

describe("rankCompanies", () => {
  const book = loadRubrics();

  test("min-max normalises each metric across the companies that have it", () => {
    const rows = rankCompanies(
      [
        input({ companyId: 1, name: "㈜가", sentiment: 8, awards: 2, investments: 0, revenue: 1_000, verification: "verified" }),
        input({ companyId: 2, name: "㈜나", sentiment: -2, awards: 0, investments: 2, revenue: 3_000, verification: "needs_review" }),
      ],
      book,
    );
    const ga = rows.find((row) => row.companyId === 1)!;
    const metric = (key: string) => ga.metrics.find((m) => m.key === key)!.normalised;
    expect(metric("sentiment")).toBe(1);
    expect(metric("award")).toBe(1);
    expect(metric("investment")).toBe(0);
    expect(metric("finance")).toBe(0);
    expect(metric("verification")).toBe(1);
  });

  test("a metric nobody varies on scores 0.5 for everyone rather than dividing by zero", () => {
    const rows = rankCompanies(
      [input({ companyId: 1, name: "㈜가", sentiment: 3 }), input({ companyId: 2, name: "㈜나", sentiment: 3 })],
      book,
    );
    expect(rows[0].metrics.find((m) => m.key === "sentiment")!.normalised).toBe(0.5);
  });

  test("drops missing metrics from the weights instead of counting them as zero", () => {
    const rows = rankCompanies(
      [
        input({ companyId: 1, name: "㈜가", sentiment: 10, awards: 1, investments: 1, revenue: null, verification: "verified" }),
        input({ companyId: 2, name: "㈜나", sentiment: 0, awards: 0, investments: 0, revenue: 5_000, verification: "needs_review" }),
      ],
      book,
    );
    const ga = rows.find((row) => row.companyId === 1)!;
    expect(ga.metrics.find((m) => m.key === "finance")!.normalised).toBeNull();
    expect(ga.total).toBeCloseTo(1, 6);
  });

  test("a company with no metrics at all is unranked, not last", () => {
    const rows = rankCompanies([input({ companyId: 1, name: "㈜가", sentiment: 1 }), input({ companyId: 2, name: "㈜나" })], book);
    const na = rows.find((row) => row.companyId === 2)!;
    expect(na.total).toBeNull();
    expect(na.rank).toBeNull();
    expect(rows.find((row) => row.companyId === 1)!.rank).toBe(1);
  });

  test("subtracts the rubric penalty per confirmed risk, floored at zero", () => {
    const rows = rankCompanies(
      [
        input({ companyId: 1, name: "㈜가", sentiment: 5, confirmedRisks: 1 }),
        input({ companyId: 2, name: "㈜나", sentiment: 5, confirmedRisks: 0 }),
      ],
      book,
    );
    const ga = rows.find((row) => row.companyId === 1)!;
    const na = rows.find((row) => row.companyId === 2)!;
    expect(na.total).toBe(0.5);
    expect(ga.riskPenalty).toBe(book.default.riskPenalty);
    expect(ga.total).toBeCloseTo(0.5 - book.default.riskPenalty, 6);
    expect(rankCompanies([input({ companyId: 3, name: "㈜다", sentiment: 1, confirmedRisks: 9 })], book)[0].total).toBe(0);
  });

  test("ranks by total descending with ties sharing a rank", () => {
    const rows = rankCompanies(
      [
        input({ companyId: 1, name: "㈜가", sentiment: 5 }),
        input({ companyId: 2, name: "㈜나", sentiment: 5 }),
        input({ companyId: 3, name: "㈜다", sentiment: 1 }),
      ],
      book,
    );
    expect(rows.map((row) => [row.name, row.rank])).toEqual([["㈜가", 1], ["㈜나", 1], ["㈜다", 3]]);
  });

  test("applies the industry rubric per company unless one is forced", () => {
    const inputs = [input({ companyId: 1, name: "㈜가", industry: "SW", sentiment: 1 }), input({ companyId: 2, name: "㈜나", industry: "ESG", sentiment: 1 })];
    expect(rankCompanies(inputs, book).map((row) => row.rubricId)).toEqual(["ict", "default"]);
    expect(rankCompanies(inputs, book, "bio").map((row) => row.rubricId)).toEqual(["bio", "bio"]);
  });
});
