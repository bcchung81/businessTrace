import { describe, it, expect } from "vitest";
import { SYSTEM_JUDGE, judgePrompt } from "@/lib/services/prompts/verification";
import type { NewsAnalysis } from "@/lib/services/analyzer";
import type { NewsItem } from "@/lib/services/newsTypes";

const news: NewsItem = {
  title: "넷록스, 시리즈A 투자 유치",
  link: "https://www.etnews.com/1",
  description: "요약",
  content: "넷록스가 시리즈A 투자를 유치했다고 30일 밝혔다.",
  published: "2025-01-15T00:12:00.000Z",
  source: "전자신문",
  provider: "naver",
  titleMatch: true,
  mentions: 4,
  relevance: "primary",
};

const analysis: NewsAnalysis = {
  news,
  isAboutCompany: true,
  trend: {
    is_about_company: "Y",
    news_trend_summary: "넷록스가 시리즈A 투자를 유치했다",
    sentiment_score: 6,
    sentiment_label: "긍정적",
  },
  award: { is_award_related: "N", award_name: "", award_reason: "" },
  investment: { is_investment_related: "Y", investment_name: "시리즈A", investment_reason: "이유" },
};

describe("SYSTEM_JUDGE", () => {
  it("casts the model as a verifier, not another analyst", () => {
    expect(SYSTEM_JUDGE).toContain("검증");
    expect(SYSTEM_JUDGE).not.toContain("분석 전문가");
  });
});

describe("judgePrompt", () => {
  const prompt = judgePrompt("넷록스", {
    comprehensiveOpinion: "넷록스는 투자 유치로 성장세를 보인다",
    analyses: [analysis],
  });

  it("hands over the source article so the judge can check against it", () => {
    expect(prompt).toContain("넷록스가 시리즈A 투자를 유치했다고 30일 밝혔다.");
    expect(prompt).toContain("https://www.etnews.com/1");
  });

  it("hands over the claims that need checking", () => {
    expect(prompt).toContain("넷록스가 시리즈A 투자를 유치했다");
    expect(prompt).toContain("넷록스는 투자 유치로 성장세를 보인다");
  });

  it("excludes AI-computed aggregates from the source check and limits counter-evidence to contradictions", () => {
    expect(prompt).toContain("집계 수치는 AI 산출물");
    expect(prompt).toContain("실제로 모순되는 사실만");
    expect(prompt).not.toContain("표본이 적은 경우가 이에 해당합니다");
  });

  it("asks for a per-claim verdict rather than one overall score", () => {
    expect(prompt).toContain("claims");
    expect(prompt).toContain("supported");
  });

  it("asks for the reasons this assessment could be wrong", () => {
    expect(prompt).toContain("counter_evidence");
    expect(prompt).toMatch(/틀릴 수 있는 이유/);
  });

  it("forbids the judge from using knowledge outside the supplied articles", () => {
    expect(prompt).toMatch(/기사에 (없는|없다면)/);
  });

  it("names the company under review", () => {
    expect(prompt).toContain("넷록스");
  });
});
