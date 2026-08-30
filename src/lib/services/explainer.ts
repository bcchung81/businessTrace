import { METRIC_LABEL, type BenchmarkRow, type MetricKey } from "@/lib/services/benchmarking";

export type Contribution = { key: MetricKey; label: string; normalised: number | null; weight: number; share: number | null };

/**
 * 총점(감점 전)을 지표별 몫으로 가른다 — 값 있는 지표의 normalised×weight 합을 100% 로 본다.
 * 결측 지표는 지우지 않고 share null 로 남긴다. 합이 0 이면 전부 0 이다.
 */
export function explainScore(row: BenchmarkRow): Contribution[] {
  const present = row.metrics.filter((metric) => metric.normalised !== null);
  const weightSum = present.reduce((acc, metric) => acc + metric.weight, 0);
  const raw = row.metrics.map((metric) =>
    metric.normalised === null || weightSum === 0 ? null : metric.normalised * (metric.weight / weightSum),
  );
  const rawSum = raw.reduce<number>((acc, value) => acc + (value ?? 0), 0);
  return row.metrics.map((metric, index) => ({
    key: metric.key,
    label: METRIC_LABEL[metric.key],
    normalised: metric.normalised,
    weight: metric.weight,
    share: raw[index] === null ? null : rawSum === 0 ? 0 : (raw[index] as number) / rawSum,
  }));
}

import type { AnalysisResult, NewsAnalysis } from "@/lib/services/analyzer";
import type { FinancialSummary } from "@/lib/services/dart";
import { containment } from "@/lib/services/textSimilarity";
import { EVIDENCE_MATCH_THRESHOLD } from "@/lib/services/verificationScores";

export type Headline = { title: string; link: string; source: string; published: string; sentiment: number };
export type EvidenceSummary = {
  headlines: Headline[];
  finance: { fiscalYear: number; revenue: number | null; operatingIncome: number | null; netIncome: number | null } | null;
  verification: "verified" | "needs_review" | null;
};

/**
 * 화면 한 줄에 들어갈 근거 요약 — 감성이 센 헤드라인 3, DART 수치, 검증 상태.
 * 타사 기사는 뺀다. 재무는 found 일 때만 싣는다.
 */
export function summariseEvidence(input: {
  result: AnalysisResult | null;
  finance: FinancialSummary | null;
  verification: "verified" | "needs_review" | null;
}): EvidenceSummary {
  const headlines = (input.result?.analyses ?? [])
    .filter((entry) => entry.isAboutCompany)
    .sort((a, b) => Math.abs(b.trend.sentiment_score) - Math.abs(a.trend.sentiment_score))
    .slice(0, 3)
    .map((entry) => ({
      title: entry.news.title,
      link: entry.news.link,
      source: entry.news.source,
      published: entry.news.published,
      sentiment: entry.trend.sentiment_score,
    }));
  const finance = input.finance?.found
    ? {
        fiscalYear: input.finance.fiscalYear,
        revenue: input.finance.revenue,
        operatingIncome: input.finance.operatingIncome,
        netIncome: input.finance.netIncome,
      }
    : null;
  return { headlines, finance, verification: input.verification };
}

export type Snippet = { title: string; link: string; paragraph: string; score: number };
export type CitedSentence = { sentence: string; snippets: Snippet[] };

/**
 * 종결 부호(. ! ?) 뒤에서 자른다. 부호는 문장에 남긴다.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function paragraphs(content: string): string[] {
  return content
    .split(/\n{2,}|(?<=[.!?。])\s+(?=\S)/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length >= 10);
}

/**
 * 종합의견의 문장마다 가장 닮은 기사 단락을 붙인다 — containment 바이그램, 임계는 검증 게이트와 같다.
 * LLM 을 쓰지 않는다. 화면에서 hover 마다 뜨는 근거는 결정론이어야 재현된다.
 */
export function citeOpinion(opinion: string, analyses: NewsAnalysis[]): CitedSentence[] {
  const pool = analyses
    .filter((entry) => entry.isAboutCompany)
    .flatMap((entry) =>
      paragraphs(entry.news.content || entry.news.description).map((paragraph) => ({ title: entry.news.title, link: entry.news.link, paragraph })),
    );

  return splitSentences(opinion).map((sentence) => {
    const scored = pool
      .map((candidate) => ({ ...candidate, score: containment(sentence, candidate.paragraph) }))
      .filter((candidate) => candidate.score >= EVIDENCE_MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const seen = new Set<string>();
    const snippets = scored.filter((candidate) => (seen.has(candidate.link) ? false : (seen.add(candidate.link), true))).slice(0, 2);
    return { sentence, snippets };
  });
}
