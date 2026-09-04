import { describe, expect, test } from "vitest";
import { loadRubrics, rankCompanies } from "@/lib/services/benchmarking";
import { explainScore } from "@/lib/services/explainer";

const book = loadRubrics();

describe("explainScore", () => {
  test("splits the pre-penalty score into shares that sum to 100%", () => {
    const [row] = rankCompanies(
      [
        { companyId: 1, name: "㈜가", industry: null, sentiment: 10, awards: 2, investments: 1, revenue: 100, headcount: 10, verification: "verified", growth: { revenue: null, headcount: null, hiring: null, procurement: null }, stability: { debtRatio: null, roe: null, operatingMargin: null }, confirmedRisks: 1 },
        { companyId: 2, name: "㈜나", industry: null, sentiment: 0, awards: 0, investments: 0, revenue: 0, headcount: 10, verification: "needs_review", growth: { revenue: null, headcount: null, hiring: null, procurement: null }, stability: { debtRatio: null, roe: null, operatingMargin: null }, confirmedRisks: 0 },
      ],
      book,
    );
    const shares = explainScore(row);
    expect(shares.map((c) => c.key)).toEqual(["sentiment", "award", "investment", "finance", "growth", "stability", "verification"]);
    expect(shares.reduce((acc, c) => acc + (c.share ?? 0), 0)).toBeCloseTo(1, 6);
    expect(shares[0].share).toBeCloseTo(0.22 / 0.68, 6);
    expect(shares[6].label).toBe("검증");
  });

  test("keeps a missing metric in the list with a null share and re-weights the rest", () => {
    const [row] = rankCompanies(
      [
        { companyId: 1, name: "㈜가", industry: null, sentiment: 10, awards: null, investments: null, revenue: null, verification: "verified", growth: { revenue: null, headcount: null, hiring: null, procurement: null }, stability: { debtRatio: null, roe: null, operatingMargin: null }, confirmedRisks: 0 },
        { companyId: 2, name: "㈜나", industry: null, sentiment: 0, awards: null, investments: null, revenue: null, verification: "needs_review", growth: { revenue: null, headcount: null, hiring: null, procurement: null }, stability: { debtRatio: null, roe: null, operatingMargin: null }, confirmedRisks: 0 },
      ],
      book,
    );
    const shares = explainScore(row);
    expect(shares.find((c) => c.key === "award")!.share).toBeNull();
    expect(shares.find((c) => c.key === "sentiment")!.share).toBeCloseTo(0.22 / 0.32, 6);
    expect(shares.find((c) => c.key === "verification")!.share).toBeCloseTo(0.1 / 0.32, 6);
  });

  test("returns every metric with null shares when nothing was scored", () => {
    const [row] = rankCompanies(
      [{ companyId: 1, name: "㈜가", industry: null, sentiment: null, awards: null, investments: null, revenue: null, verification: null, growth: { revenue: null, headcount: null, hiring: null, procurement: null }, stability: { debtRatio: null, roe: null, operatingMargin: null }, confirmedRisks: 0 }],
      book,
    );
    expect(explainScore(row).every((c) => c.share === null)).toBe(true);
    expect(explainScore(row)).toHaveLength(7);
  });

  test("a metric scored 0 contributes 0, not null", () => {
    const rows = rankCompanies(
      [
        { companyId: 1, name: "㈜가", industry: null, sentiment: 10, awards: 0, investments: null, revenue: null, verification: null, growth: { revenue: null, headcount: null, hiring: null, procurement: null }, stability: { debtRatio: null, roe: null, operatingMargin: null }, confirmedRisks: 0 },
        { companyId: 2, name: "㈜나", industry: null, sentiment: 0, awards: 3, investments: null, revenue: null, verification: null, growth: { revenue: null, headcount: null, hiring: null, procurement: null }, stability: { debtRatio: null, roe: null, operatingMargin: null }, confirmedRisks: 0 },
      ],
      book,
    );
    const ga = rows.find((r) => r.companyId === 1)!;
    expect(explainScore(ga).find((c) => c.key === "award")!.share).toBe(0);
  });
});

import { citeOpinion, splitSentences, summariseEvidence } from "@/lib/services/explainer";
import type { NewsAnalysis, AnalysisResult } from "@/lib/services/analyzer";

function analysis(over: Partial<NewsAnalysis["news"]> & { sentiment?: number; about?: boolean }): NewsAnalysis {
  const { sentiment = 0, about = true, ...news } = over;
  return {
    news: { title: "제목", link: "https://n.example/1", description: "", content: "", published: "2026-08-01", source: "전자신문", provider: "naver", titleMatch: true, mentions: 1, relevance: "primary", ...news },
    isAboutCompany: about,
    trend: { is_about_company: about ? "Y" : "N", news_trend_summary: "", sentiment_score: sentiment, sentiment_label: "" },
    award: { is_award_related: "N", award_name: "", award_reason: "" },
    investment: { is_investment_related: "N", investment_name: "", investment_reason: "" },
  };
}

function result(analyses: NewsAnalysis[], opinion = ""): AnalysisResult {
  return {
    companyName: "㈜가",
    model: "m",
    analyses,
    comprehensiveOpinion: opinion,
    stats: { totalNews: analyses.length, scoredNews: analyses.length, excludedNews: 0, averageSentiment: 0, positiveCount: 0, negativeCount: 0, neutralCount: 0, awardCount: 0, investmentCount: 0 },
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
  fallbacks: 0,
  };
}

describe("summariseEvidence", () => {
  test("picks the three strongest headlines about the company and carries DART numbers and verification", () => {
    const summary = summariseEvidence({
      result: result([
        analysis({ title: "약한", link: "https://n.example/a", sentiment: 1 }),
        analysis({ title: "강한 긍정", link: "https://n.example/b", sentiment: 9 }),
        analysis({ title: "강한 부정", link: "https://n.example/c", sentiment: -8 }),
        analysis({ title: "중간", link: "https://n.example/d", sentiment: 4 }),
        analysis({ title: "타사", link: "https://n.example/e", sentiment: 10, about: false }),
      ]),
      finance: { found: true, fiscalYear: 2025, revenue: 1_000, operatingIncome: 100, netIncome: 50, totalAssets: 900, totalLiabilities: null, totalEquity: null },
      verification: "verified",
    });
    expect(summary.headlines.map((h) => h.title)).toEqual(["강한 긍정", "강한 부정", "중간"]);
    expect(summary.finance).toEqual({ fiscalYear: 2025, revenue: 1_000, operatingIncome: 100, netIncome: 50 });
    expect(summary.verification).toBe("verified");
  });

  test("is empty but well-formed with nothing analysed", () => {
    expect(summariseEvidence({ result: null, finance: null, verification: null })).toEqual({ headlines: [], finance: null, verification: null });
    expect(
      summariseEvidence({ result: null, finance: { found: false, fiscalYear: 2025, revenue: null, operatingIncome: null, netIncome: null, totalAssets: null, totalLiabilities: null, totalEquity: null }, verification: null }).finance,
    ).toBeNull();
  });
});

describe("splitSentences", () => {
  test("cuts on Korean sentence enders and keeps the ender", () => {
    expect(splitSentences("시리즈B 120억 원을 유치했다. 수상도 있었다! 리스크는 없나?")).toEqual(["시리즈B 120억 원을 유치했다.", "수상도 있었다!", "리스크는 없나?"]);
  });
  test("drops blanks", () => {
    expect(splitSentences("  ")).toEqual([]);
  });
});

describe("citeOpinion", () => {
  const body = "㈜가는 2026년 8월 시리즈B 투자로 120억 원을 유치했다고 밝혔다.\n\n회사는 이번 자금을 연구개발에 쓴다.\n\n별개로 날씨가 좋았다.";
  const analyses = [
    analysis({ title: "㈜가 120억 유치", link: "https://n.example/1", content: body }),
    analysis({ title: "무관", link: "https://n.example/2", content: "전혀 다른 기사 내용이다." }),
  ];

  test("attaches the best-matching paragraph to each sentence above the evidence threshold", () => {
    const cited = citeOpinion("㈜가는 시리즈B 투자로 120억 원을 유치했다. 날씨 이야기는 근거가 없다.", analyses);
    expect(cited).toHaveLength(2);
    expect(cited[0].snippets[0]).toMatchObject({ link: "https://n.example/1", paragraph: "㈜가는 2026년 8월 시리즈B 투자로 120억 원을 유치했다고 밝혔다." });
    expect(cited[0].snippets[0].score).toBeGreaterThanOrEqual(0.4);
    expect(cited[0].snippets.length).toBeLessThanOrEqual(2);
  });

  test("leaves a sentence uncited when no paragraph clears the threshold", () => {
    const cited = citeOpinion("이 문장은 어느 기사에도 없다.", analyses);
    expect(cited[0].snippets).toEqual([]);
  });

  test("ignores articles the analyser marked as not about the company", () => {
    const cited = citeOpinion("㈜가는 시리즈B 투자로 120억 원을 유치했다.", [analysis({ content: body, about: false })]);
    expect(cited[0].snippets).toEqual([]);
  });
});
