import rubricsJson from "@/lib/services/rubrics.json";

export type MetricKey = "sentiment" | "award" | "investment" | "finance" | "verification";
export type Weights = Record<MetricKey, number>;
export type Rubric = { id: string; name: string; industries: string[]; weights: Weights; riskPenalty: number };
export type RubricBook = { formulaVersion: string; default: Rubric; rubrics: Rubric[] };

export const METRIC_KEYS: MetricKey[] = ["sentiment", "award", "investment", "finance", "verification"];
export const METRIC_LABEL: Record<MetricKey, string> = {
  sentiment: "감성",
  award: "수상",
  investment: "투자",
  finance: "재무",
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

export type BenchmarkInput = {
  companyId: number;
  name: string;
  industry: string | null;
  sentiment: number | null;
  awards: number | null;
  investments: number | null;
  revenue: number | null;
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
      return input.revenue;
    case "verification":
      return input.verification === null ? null : input.verification === "verified" ? 1 : 0;
  }
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
