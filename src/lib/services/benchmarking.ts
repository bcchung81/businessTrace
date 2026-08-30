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
