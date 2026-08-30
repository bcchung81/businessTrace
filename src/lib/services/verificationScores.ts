import type { NewsAnalysis } from "@/lib/services/analyzer";
import { containment } from "@/lib/services/textSimilarity";

export const FAITHFULNESS_THRESHOLD = 0.85;
export const SOURCE_COVERAGE_THRESHOLD = 0.5;
export const EVIDENCE_MATCH_THRESHOLD = 0.5;

/**
 * 세 게이트 중 탈락한 것의 이름을 낸다 — "검토 필요" 만으로는 무엇을 봐야 하는지 모른다.
 */
export function failedGates(scores: { sourceCoverage: number; faithfulness: number | null; evidenceMatch: number }): string[] {
  return [
    scores.sourceCoverage < SOURCE_COVERAGE_THRESHOLD ? "출처 인용" : null,
    (scores.faithfulness ?? 0) < FAITHFULNESS_THRESHOLD ? "근거 충실도" : null,
    scores.evidenceMatch < EVIDENCE_MATCH_THRESHOLD ? "근거 일치" : null,
  ].filter((name): name is string => name !== null);
}

export type VerificationStatus = "verified" | "needs_review";

export type SourceCheck = {
  coverage: number;
  cited: number;
  total: number;
  invalid: Array<{ title: string; link: string }>;
};

function isCitable(link: string) {
  try {
    return ["http:", "https:"].includes(new URL(link).protocol);
  } catch {
    return false;
  }
}

/**
 * 층① 출처 인용 검사 — 인용 가능한 링크의 비율을 낸다.
 * http(s) 가 아닌 링크는 근거로 쓸 수 없으므로 미인용으로 센다.
 */
export function checkSources(analyses: NewsAnalysis[]): SourceCheck {
  const invalid = analyses
    .filter((analysis) => !isCitable(analysis.news.link))
    .map((analysis) => ({ title: analysis.news.title, link: analysis.news.link }));

  const cited = analyses.length - invalid.length;

  return {
    coverage: analyses.length === 0 ? 0 : cited / analyses.length,
    cited,
    total: analyses.length,
    invalid,
  };
}

/**
 * 층③ evidence-match — 분석 요약의 어휘가 원문에 얼마나 들어 있는지 낸다.
 * LLM 을 쓰지 않는다. judge 자신의 오판을 걸러낼 독립 신호가 필요하기 때문이다.
 * dice 는 원문이 길수록 떨어져 기사 길이를 재는 꼴이었다 — 6개사 실측에서 0.14~0.52, containment 는 0.62~0.76.
 */
export function evidenceMatch(analyses: NewsAnalysis[]) {
  if (analyses.length === 0) return 0;

  const scores = analyses.map((analysis) =>
    containment(analysis.trend.news_trend_summary, `${analysis.news.title} ${analysis.news.content}`),
  );

  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

/**
 * 세 게이트의 논리곱으로 검증 상태를 판정한다.
 * judge 점수가 없으면 다른 게이트가 완벽해도 needs_review 다.
 */
export function decide(scores: {
  faithfulness: number | null;
  sourceCoverage: number;
  evidenceMatch: number;
}): VerificationStatus {
  const passed =
    scores.faithfulness !== null &&
    scores.faithfulness >= FAITHFULNESS_THRESHOLD &&
    scores.sourceCoverage >= SOURCE_COVERAGE_THRESHOLD &&
    scores.evidenceMatch >= EVIDENCE_MATCH_THRESHOLD;

  return passed ? "verified" : "needs_review";
}
