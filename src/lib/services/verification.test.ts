import { describe, it, expect, vi } from "vitest";
import { verifyAnalysis } from "@/lib/services/verification";
import type { AnalysisResult, NewsAnalysis } from "@/lib/services/analyzer";
import type { LlmClient } from "@/lib/services/llm";
import { LlmRefusalError } from "@/lib/services/llm";
import type { NewsItem } from "@/lib/services/newsTypes";

function analysis(patch: { link?: string; summary?: string; content?: string } = {}): NewsAnalysis {
  const news: NewsItem = {
    title: "넷록스, 시리즈A 투자 유치",
    link: patch.link ?? "https://www.etnews.com/1",
    description: "요약",
    content: patch.content ?? "넷록스가 시리즈A 투자를 유치했다고 30일 밝혔다.",
    published: "2025-01-15T00:12:00.000Z",
    source: "전자신문",
    provider: "naver",
    titleMatch: true,
    mentions: 4,
    relevance: "primary",
  };

  return {
    news,
    isAboutCompany: true,
    trend: {
      is_about_company: "Y",
      news_trend_summary: patch.summary ?? "넷록스가 시리즈A 투자를 유치했다",
      sentiment_score: 6,
      sentiment_label: "긍정적",
    },
    award: { is_award_related: "N", award_name: "", award_reason: "" },
    investment: { is_investment_related: "N", investment_name: "", investment_reason: "" },
  };
}

function result(analyses: NewsAnalysis[]): AnalysisResult {
  return {
    companyName: "넷록스",
    model: "claude-sonnet-5",
    analyses,
    comprehensiveOpinion: "넷록스가 시리즈A 투자를 유치했다",
    stats: {
      totalNews: analyses.length,
      scoredNews: analyses.length,
      excludedNews: 0,
      averageSentiment: 6,
      positiveCount: analyses.length,
      negativeCount: 0,
      neutralCount: 0,
      awardCount: 0,
      investmentCount: 0,
    },
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
  fallbacks: 0,
  };
}

function judge(data: unknown): LlmClient {
  return {
    json: vi.fn(async () => ({
      data,
      usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 0 },
    })),
  } as unknown as LlmClient;
}

const ALL_SUPPORTED = {
  claims: [
    { claim: "넷록스가 시리즈A 투자를 유치했다", supported: true, evidence: "…투자를 유치했다고 30일 밝혔다." },
  ],
  counter_evidence: ["단일 출처에 의존한 보도입니다"],
};

describe("verifyAnalysis", () => {
  it("verifies when all four layers clear their gates", async () => {
    const output = await verifyAnalysis(result([analysis()]), { llm: judge(ALL_SUPPORTED) });

    expect(output.status).toBe("verified");
    expect(output.faithfulness).toBe(1);
    expect(output.sourceCoverage).toBe(1);
  });

  it("surfaces the counter evidence instead of hiding it", async () => {
    const output = await verifyAnalysis(result([analysis()]), { llm: judge(ALL_SUPPORTED) });

    expect(output.counterEvidence).toEqual(["단일 출처에 의존한 보도입니다"]);
  });

  it("lists the claims the judge could not support", async () => {
    const output = await verifyAnalysis(result([analysis()]), {
      llm: judge({
        claims: [
          { claim: "투자를 유치했다", supported: true, evidence: "…" },
          { claim: "업계 1위로 올라섰다", supported: false, evidence: "" },
        ],
        counter_evidence: [],
      }),
    });

    expect(output.unsupportedClaims).toEqual(["업계 1위로 올라섰다"]);
    expect(output.faithfulness).toBe(0.5);
    expect(output.status).toBe("needs_review");
  });

  it("marks the run failed when the judge call fails — no verdict was reached", async () => {
    const llm = { json: vi.fn(async () => { throw new Error("timeout"); }) } as unknown as LlmClient;

    const output = await verifyAnalysis(result([analysis()]), { llm });

    expect(output.status).toBe("failed");
    expect(output.faithfulness).toBeNull();
    expect(output.detail.error).toContain("timeout");
  });

  it("marks the run failed when the judge refuses", async () => {
    const llm = {
      json: vi.fn(async () => {
        throw new LlmRefusalError("refused");
      }),
    } as unknown as LlmClient;

    expect((await verifyAnalysis(result([analysis()]), { llm })).status).toBe("failed");
  });

  it("holds back an analysis whose sources are mostly uncitable, even with a perfect judge", async () => {
    const output = await verifyAnalysis(
      result([analysis(), analysis({ link: "" }), analysis({ link: "not-a-url" })]),
      { llm: judge(ALL_SUPPORTED) },
    );

    expect(output.sourceCoverage).toBeCloseTo(1 / 3);
    expect(output.status).toBe("needs_review");
  });

  it("holds back an analysis whose summaries do not echo the articles", async () => {
    const output = await verifyAnalysis(
      result([analysis({ summary: "삼성전자 반도체 실적이 급증했다", content: "넷록스 투자 유치" })]),
      { llm: judge(ALL_SUPPORTED) },
    );

    expect(output.evidenceMatch).toBeLessThan(0.4);
    expect(output.status).toBe("needs_review");
  });

  it("treats a judge answer with no claims as unverifiable rather than perfect", async () => {
    const output = await verifyAnalysis(result([analysis()]), {
      llm: judge({ claims: [], counter_evidence: [] }),
    });

    expect(output.faithfulness).toBe(0);
    expect(output.status).toBe("needs_review");
  });

  it("keeps every layer score in the detail so a reviewer can see which gate failed", async () => {
    const output = await verifyAnalysis(result([analysis()]), { llm: judge(ALL_SUPPORTED) });

    expect(output.detail.layer1.total).toBe(1);
    expect(output.detail.layer2?.claims).toHaveLength(1);
    expect(typeof output.detail.layer3).toBe("number");
  });

  it("never returns verified when there is nothing to verify", async () => {
    const output = await verifyAnalysis(result([]), { llm: judge(ALL_SUPPORTED) });

    expect(output.status).toBe("needs_review");
  });
});
