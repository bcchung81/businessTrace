import rubricsJson from "@/lib/services/rubrics.json";

export type MetricKey = "sentiment" | "award" | "investment" | "finance" | "growth" | "stability" | "verification";
export type Weights = Record<MetricKey, number>;
export type Rubric = { id: string; name: string; industries: string[]; weights: Weights; riskPenalty: number };
export type RubricBook = { formulaVersion: string; default: Rubric; rubrics: Rubric[] };

export const METRIC_KEYS: MetricKey[] = ["sentiment", "award", "investment", "finance", "growth", "stability", "verification"];
export const METRIC_LABEL: Record<MetricKey, string> = {
  sentiment: "감성",
  award: "수상",
  investment: "투자",
  finance: "재무",
  growth: "성장",
  stability: "안정",
  verification: "검증",
};

/**
 * 루브릭 책을 읽는다. JSON 이 원천이라 코드에는 숫자가 없다.
 */
export function loadRubrics(): RubricBook {
  return rubricsJson as RubricBook;
}

/**
 * 업종 이름으로 루브릭을 고른다. 별칭 표에 없으면 기본 가중치다 — 추측하지 않는다.
 */
export function resolveRubric(industry: string | null, book: RubricBook): Rubric {
  const name = (industry ?? "").trim();
  return book.rubrics.find((rubric) => rubric.industries.includes(name)) ?? book.default;
}

/**
 * 가중치를 화면 문구로 적는다 — 숫자가 보이지 않는 점수는 근거가 아니다.
 */
export function weightLabel(rubric: Rubric): string {
  const parts = METRIC_KEYS.map((key) => `${METRIC_LABEL[key]} ${rubric.weights[key]}`);
  return `${parts.join(" · ")} · 리스크 감점`;
}

/** 성장 하위 신호 — 전부 증가율이고, 못 잰 것은 0 이 아니라 null 이다. */
export type GrowthSignals = {
  revenue: number | null;
  headcount: number | null;
  hiring: number | null;
  procurement: number | null;
};

export const GROWTH_KEYS: Array<keyof GrowthSignals> = ["revenue", "headcount", "hiring", "procurement"];
export const GROWTH_LABEL: Record<keyof GrowthSignals, string> = {
  revenue: "매출 증가율",
  headcount: "고용 증감",
  hiring: "입·퇴사 순증",
  procurement: "조달 수주 추이",
};

/**
 * 같은 것을 다른 각도로 재는 신호는 한 묶음이다 — 고용 증감(잔고)과 입·퇴사 순증(흐름).
 * 묶지 않으면 고용이 매출·조달의 두 배 가중을 받는다. 수상 기사 하나가 세 지표를 움직이던 것과 같은 실수다.
 */
export const GROWTH_FAMILIES: Array<Array<keyof GrowthSignals>> = [["revenue"], ["headcount", "hiring"], ["procurement"]];

/** 지속가능성 하위 신호 — 재무 3비율. 자본잠식이면 부채비율·ROE 는 null 이다(수치가 나와도 뜻이 뒤집힌다). */
export type StabilitySignals = {
  debtRatio: number | null;
  roe: number | null;
  operatingMargin: number | null;
};

export const STABILITY_KEYS: Array<keyof StabilitySignals> = ["debtRatio", "roe", "operatingMargin"];
export const STABILITY_LABEL: Record<keyof StabilitySignals, string> = { debtRatio: "부채비율", roe: "ROE", operatingMargin: "영업이익률" };
/** 낮을수록 좋은 비율 — 정규화 뒤 방향을 뒤집는다. */
const LOWER_IS_BETTER: ReadonlySet<keyof StabilitySignals> = new Set(["debtRatio"]);

export type BenchmarkInput = {
  companyId: number;
  name: string;
  industry: string | null;
  sentiment: number | null;
  awards: number | null;
  investments: number | null;
  /** 매출 절대값. 재무 축은 이것을 인원으로 나눈 1인당 값을 쓴다 — 절대값이면 큰 기업이 자동으로 이긴다. */
  revenue: number | null;
  /** 재무제표가 없을 때의 대리지표 — 공공조달 수주 합계(사업자번호 확정분만). */
  procurementTotal?: number | null;
  /** 최신 국민연금 가입자 수. 없으면 재무 축은 결측이다 — 절대값으로 되돌아가지 않는다. */
  headcount?: number | null;
  growth: GrowthSignals;
  stability: StabilitySignals;
  verification: "verified" | "needs_review" | null;
  confirmedRisks: number;
};

export type MetricScore = { key: MetricKey; raw: number | null; normalised: number | null; weight: number };

export type BenchmarkRow = {
  companyId: number;
  name: string;
  industry: string | null;
  rubricId: string;
  rubricName: string;
  metrics: MetricScore[];
  riskPenalty: number;
  total: number | null;
  rank: number | null;
};

function rawMetric(input: BenchmarkInput, key: MetricKey): number | null {
  switch (key) {
    case "sentiment":
      return input.sentiment;
    case "award":
      return input.awards;
    case "investment":
      return input.investments;
    case "finance":
      return perHead(input.revenue ?? input.procurementTotal ?? null, input.headcount ?? null);
    case "growth":
      return mean(GROWTH_KEYS.map((key) => input.growth[key]));
    case "stability":
      return mean(STABILITY_KEYS.map((key) => input.stability[key]));
    case "verification":
      return input.verification === null ? null : input.verification === "verified" ? 1 : 0;
  }
}

/** 인원당 값. 분모가 없거나 0 이하면 결측이다 — 절대값을 대신 쓰면 규모가 다시 점수가 된다. */
function perHead(amount: number | null, headcount: number | null): number | null {
  if (amount === null || headcount === null || headcount <= 0) return null;
  return amount / headcount;
}

/** 관측된 값만 평균한다. 하나도 없으면 결측이다. */
function mean(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return null;
  return present.reduce((acc, value) => acc + value, 0) / present.length;
}

/**
 * 값이 있는 기업들 사이에서 0~1 로 편다. 모두 같은 값이면 0.5 — 차이가 없는데 순위를 가르지 않는다.
 */
function normalise(values: Array<number | null>): Array<number | null> {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return values.map(() => null);
  const min = Math.min(...present);
  const max = Math.max(...present);
  return values.map((value) => (value === null ? null : max === min ? 0.5 : (value - min) / (max - min)));
}

function total(metrics: MetricScore[], penalty: number): number | null {
  const present = metrics.filter((metric) => metric.normalised !== null);
  if (present.length === 0) return null;
  const weightSum = present.reduce((acc, metric) => acc + metric.weight, 0);
  const score = present.reduce((acc, metric) => acc + (metric.normalised as number) * (metric.weight / weightSum), 0);
  return Math.max(0, score - penalty);
}

/**
 * 기업들을 루브릭으로 점수화해 순위를 매긴다. 결측 지표는 가중치에서 빼고, 리스크는 확인된 것만 감점한다.
 * 지표가 하나도 없는 기업은 꼴찌가 아니라 순위 없음이다 — 0 으로 그리면 결측이 사라진다.
 */
export function rankCompanies(inputs: BenchmarkInput[], book: RubricBook, rubricId?: string): BenchmarkRow[] {
  const forced = rubricId ? [book.default, ...book.rubrics].find((rubric) => rubric.id === rubricId) : undefined;
  const columns = Object.fromEntries(
    METRIC_KEYS.map((key) => [key, normalise(inputs.map((input) => rawMetric(input, key)))]),
  ) as Record<MetricKey, Array<number | null>>;
  // 성장은 하위 신호마다 단위와 분산이 달라 먼저 각각 편 뒤, 묶음 안에서 평균하고, 묶음끼리 다시 평균한다.
  // 원시 증가율을 그대로 평균하면 변동폭이 큰 신호 하나가 축 전체를 끌고 간다.
  const growthColumns = Object.fromEntries(
    GROWTH_KEYS.map((key) => [key, normalise(inputs.map((input) => input.growth[key]))]),
  ) as Record<keyof GrowthSignals, Array<number | null>>;
  columns.growth = inputs.map((_, index) =>
    mean(GROWTH_FAMILIES.map((family) => mean(family.map((key) => growthColumns[key][index])))),
  );
  // 지속가능성도 비율마다 따로 편다. 부채비율은 낮을수록 좋으니 뒤집는다.
  const stabilityColumns = STABILITY_KEYS.map((key) => {
    const column = normalise(inputs.map((input) => input.stability[key]));
    return LOWER_IS_BETTER.has(key) ? column.map((value) => (value === null ? null : 1 - value)) : column;
  });
  columns.stability = inputs.map((_, index) => mean(stabilityColumns.map((column) => column[index])));

  const rows: BenchmarkRow[] = inputs.map((input, index) => {
    const rubric = forced ?? resolveRubric(input.industry, book);
    const metrics = METRIC_KEYS.map((key) => ({ key, raw: rawMetric(input, key), normalised: columns[key][index], weight: rubric.weights[key] }));
    const riskPenalty = input.confirmedRisks * rubric.riskPenalty;
    return {
      companyId: input.companyId,
      name: input.name,
      industry: input.industry,
      rubricId: rubric.id,
      rubricName: rubric.name,
      metrics,
      riskPenalty,
      total: total(metrics, riskPenalty),
      rank: null,
    };
  });

  rows.sort((a, b) => (b.total ?? -1) - (a.total ?? -1) || a.name.localeCompare(b.name, "ko"));
  rows.forEach((row, index) => {
    if (row.total === null) return;
    const prev = rows[index - 1];
    row.rank = prev && prev.total === row.total ? prev.rank : index + 1;
  });
  return rows;
}
