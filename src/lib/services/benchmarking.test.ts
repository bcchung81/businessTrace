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
    expect(resolveRubric("ESG", book).id).toBe("default");
    expect(resolveRubric(null, book).id).toBe("default");
  });

  test("spells the weights out the way the screen shows them", () => {
    expect(weightLabel(book.default)).toBe("감성 0.3 · 수상 0.2 · 투자 0.2 · 재무 0.2 · 검증 0.1 · 리스크 감점");
  });
});
