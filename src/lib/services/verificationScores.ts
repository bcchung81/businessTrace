import type { NewsAnalysis } from "@/lib/services/analyzer";
import { diceSimilarity } from "@/lib/services/textSimilarity";

export const FAITHFULNESS_THRESHOLD = 0.85;
export const SOURCE_COVERAGE_THRESHOLD = 0.5;
export const EVIDENCE_MATCH_THRESHOLD = 0.4;

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

export function evidenceMatch(analyses: NewsAnalysis[]) {
  if (analyses.length === 0) return 0;

  const scores = analyses.map((analysis) =>
    diceSimilarity(
      analysis.trend.news_trend_summary,
      `${analysis.news.title} ${analysis.news.content}`,
    ),
  );

  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

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
