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
    expect(book.default.weights).toEqual({ sentiment: 0.22, award: 0.13, investment: 0.13, finance: 0.1, growth: 0.2, stability: 0.12, verification: 0.1 });
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
    expect(weightLabel(book.default)).toBe("감성 0.22 · 수상 0.13 · 투자 0.13 · 재무 0.1 · 성장 0.2 · 안정 0.12 · 검증 0.1 · 리스크 감점");
  });
});

import { rankCompanies, type BenchmarkInput } from "@/lib/services/benchmarking";

const NO_GROWTH = { revenue: null, headcount: null, hiring: null, procurement: null };
const NO_STABILITY = { debtRatio: null, roe: null, operatingMargin: null };

function input(over: Partial<BenchmarkInput> & { companyId: number; name: string }): BenchmarkInput {
  return { industry: null, sentiment: null, awards: null, investments: null, revenue: null, growth: NO_GROWTH, stability: NO_STABILITY, verification: null, confirmedRisks: 0, ...over };
}

describe("rankCompanies", () => {
  const book = loadRubrics();

  test("min-max normalises each metric across the companies that have it", () => {
    const rows = rankCompanies(
      [
        input({ companyId: 1, name: "㈜가", sentiment: 8, awards: 2, investments: 0, revenue: 1_000, headcount: 10, verification: "verified" }),
        input({ companyId: 2, name: "㈜나", sentiment: -2, awards: 0, investments: 2, revenue: 3_000, headcount: 10, verification: "needs_review" }),
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
        input({ companyId: 2, name: "㈜나", sentiment: 0, awards: 0, investments: 0, revenue: 5_000, headcount: 10, verification: "needs_review" }),
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

describe("성장 축 — 커버리지가 다른 신호를 하나로 접는다", () => {
  const book = loadRubrics();
  const growthOf = (rows: ReturnType<typeof rankCompanies>, id: number) =>
    rows.find((row) => row.companyId === id)!.metrics.find((m) => m.key === "growth")!;

  test("규모(finance)와 속도(growth)를 따로 센다 — 큰 기업이 자동으로 이기지 않는다", () => {
    const rows = rankCompanies(
      [
        input({ companyId: 1, name: "큰곳", revenue: 10_000, headcount: 10, growth: { ...NO_GROWTH, revenue: 0.0 } }),
        input({ companyId: 2, name: "작은곳", revenue: 100, headcount: 10, growth: { ...NO_GROWTH, revenue: 1.0 } }),
      ],
      book,
    );
    expect(rows.find((r) => r.companyId === 1)!.metrics.find((m) => m.key === "finance")!.normalised).toBe(1);
    expect(growthOf(rows, 1).normalised).toBe(0);
    expect(growthOf(rows, 2).normalised).toBe(1);
  });

  test("각 하위 신호를 따로 정규화한 뒤 평균한다 — 분산이 큰 신호가 지배하지 못한다", () => {
    const rows = rankCompanies(
      [
        // 매출은 꼴찌(0), 고용은 1등(1) → 평균 0.5
        input({ companyId: 1, name: "가", growth: { ...NO_GROWTH, revenue: 0.01, headcount: 0.5 } }),
        input({ companyId: 2, name: "나", growth: { ...NO_GROWTH, revenue: 5.0, headcount: 0.1 } }),
      ],
      book,
    );
    expect(growthOf(rows, 1).normalised).toBeCloseTo(0.5, 6);
    expect(growthOf(rows, 2).normalised).toBeCloseTo(0.5, 6);
  });

  test("관측된 신호만 평균한다 — 조달 미참여가 성장 0 으로 읽히면 안 된다", () => {
    const rows = rankCompanies(
      [
        input({ companyId: 1, name: "가", growth: { ...NO_GROWTH, revenue: 0.4, headcount: 0.4 } }),
        input({ companyId: 2, name: "나", growth: { ...NO_GROWTH, revenue: 0.0, headcount: 0.0, procurement: 2.0 } }),
      ],
      book,
    );
    expect(growthOf(rows, 1).normalised).toBe(1);
  });

  test("신호가 하나뿐인 기업도 점수를 받는다", () => {
    const rows = rankCompanies(
      [
        input({ companyId: 1, name: "가", growth: { ...NO_GROWTH, headcount: 0.9 } }),
        input({ companyId: 2, name: "나", growth: { ...NO_GROWTH, headcount: 0.1 } }),
      ],
      book,
    );
    expect(growthOf(rows, 1).normalised).toBe(1);
  });

  test("세 신호가 모두 결측이면 가중치에서 빠진다 — 0 점이 아니다", () => {
    const rows = rankCompanies(
      [
        input({ companyId: 1, name: "가", sentiment: 5, growth: NO_GROWTH }),
        input({ companyId: 2, name: "나", sentiment: 1, growth: { ...NO_GROWTH, revenue: 0.5 } }),
      ],
      book,
    );
    expect(growthOf(rows, 1).normalised).toBeNull();
    expect(growthOf(rows, 1).raw).toBeNull();
  });

  test("raw 는 관측된 원시 증가율의 평균이다 — 화면이 숫자를 보여줄 수 있어야 한다", () => {
    const rows = rankCompanies(
      [input({ companyId: 1, name: "가", growth: { ...NO_GROWTH, revenue: 0.4, headcount: 0.2 } })],
      book,
    );
    expect(growthOf(rows, 1).raw).toBeCloseTo(0.3, 6);
  });
});

describe("성장 축 — 고용 계열은 한 묶음이다", () => {
  const book = loadRubrics();
  const growthOf = (rows: ReturnType<typeof rankCompanies>, id: number) =>
    rows.find((row) => row.companyId === id)!.metrics.find((m) => m.key === "growth")!;

  test("고용 증감과 입·퇴사 순증은 같은 것을 두 각도로 잰 것이라 합쳐서 한 신호 몫만 가진다", () => {
    const rows = rankCompanies(
      [
        // 매출 꼴찌(0), 고용 계열 1등(1·1) → 묶으면 (0 + 1) / 2 = 0.5. 셋을 따로 평균하면 0.67 이 된다.
        input({ companyId: 1, name: "가", growth: { revenue: 0.0, headcount: 0.9, hiring: 0.9, procurement: null } }),
        input({ companyId: 2, name: "나", growth: { revenue: 1.0, headcount: 0.1, hiring: 0.1, procurement: null } }),
      ],
      book,
    );
    expect(growthOf(rows, 1).normalised).toBeCloseTo(0.5, 6);
  });

  test("묶음 안에서 하나만 있어도 그 묶음은 산다", () => {
    const rows = rankCompanies(
      [
        input({ companyId: 1, name: "가", growth: { ...NO_GROWTH, hiring: 0.3 } }),
        input({ companyId: 2, name: "나", growth: { ...NO_GROWTH, hiring: 0.1 } }),
      ],
      book,
    );
    expect(growthOf(rows, 1).normalised).toBe(1);
  });
});

describe("재무 축은 1인당이다 — 규모 보정", () => {
  const book = loadRubrics();
  const financeOf = (rows: ReturnType<typeof rankCompanies>, id: number) =>
    rows.find((row) => row.companyId === id)!.metrics.find((m) => m.key === "finance")!;

  test("매출을 인원으로 나눈다 — 100명이 100억 버는 곳보다 10명이 20억 버는 곳이 위다", () => {
    const rows = rankCompanies(
      [
        input({ companyId: 1, name: "큰곳", revenue: 10_000, headcount: 100 }),
        input({ companyId: 2, name: "작은곳", revenue: 2_000, headcount: 10 }),
      ],
      book,
    );
    expect(financeOf(rows, 1).raw).toBe(100);
    expect(financeOf(rows, 2).raw).toBe(200);
    expect(financeOf(rows, 2).normalised).toBe(1);
  });

  test("재무제표가 없으면 조달 수주액을 인원으로 나눈 대리지표를 쓴다", () => {
    const rows = rankCompanies([input({ companyId: 1, name: "가", revenue: null, procurementTotal: 3_000, headcount: 30 })], book);

    expect(financeOf(rows, 1).raw).toBe(100);
  });

  test("인원을 모르면 결측이다 — 절대값으로 되돌아가 큰 기업을 올리지 않는다", () => {
    const rows = rankCompanies([input({ companyId: 1, name: "가", revenue: 10_000, headcount: null })], book);

    expect(financeOf(rows, 1).raw).toBeNull();
    expect(financeOf(rows, 1).normalised).toBeNull();
  });
});

describe("지속가능성 축 — 재무 3비율", () => {
  const book = loadRubrics();
  const stabilityOf = (rows: ReturnType<typeof rankCompanies>, id: number) =>
    rows.find((row) => row.companyId === id)!.metrics.find((m) => m.key === "stability")!;

  test("부채비율은 낮을수록 좋다 — 방향을 뒤집어 편다", () => {
    const rows = rankCompanies(
      [
        input({ companyId: 1, name: "가", stability: { ...NO_STABILITY, debtRatio: 0.5 } }),
        input({ companyId: 2, name: "나", stability: { ...NO_STABILITY, debtRatio: 3.0 } }),
      ],
      book,
    );
    expect(stabilityOf(rows, 1).normalised).toBe(1);
    expect(stabilityOf(rows, 2).normalised).toBe(0);
  });

  test("ROE 와 영업이익률은 높을수록 좋고, 셋을 각각 편 뒤 평균한다", () => {
    const rows = rankCompanies(
      [
        // 부채 최고(0) · ROE 최고(1) · 마진 최고(1) → 0.67
        input({ companyId: 1, name: "가", stability: { debtRatio: 3.0, roe: 0.3, operatingMargin: 0.2 } }),
        input({ companyId: 2, name: "나", stability: { debtRatio: 0.5, roe: 0.0, operatingMargin: 0.0 } }),
      ],
      book,
    );
    expect(stabilityOf(rows, 1).normalised).toBeCloseTo(2 / 3, 6);
    expect(stabilityOf(rows, 2).normalised).toBeCloseTo(1 / 3, 6);
  });

  test("자본잠식으로 두 비율이 빠져도 남은 하나로 점수를 받는다", () => {
    const rows = rankCompanies(
      [
        input({ companyId: 1, name: "가", stability: { debtRatio: null, roe: null, operatingMargin: 0.2 } }),
        input({ companyId: 2, name: "나", stability: { debtRatio: 1.0, roe: 0.1, operatingMargin: -0.1 } }),
      ],
      book,
    );
    expect(stabilityOf(rows, 1).normalised).toBe(1);
  });

  test("재무제표가 없으면 가중치에서 빠진다 — 0 점이 아니다", () => {
    const rows = rankCompanies([input({ companyId: 1, name: "가", sentiment: 5 }), input({ companyId: 2, name: "나", sentiment: 1, stability: { ...NO_STABILITY, roe: 0.1 } })], book);
    expect(stabilityOf(rows, 1).normalised).toBeNull();
    expect(stabilityOf(rows, 1).raw).toBeNull();
  });
});
