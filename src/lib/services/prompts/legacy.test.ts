import { describe, it, expect } from "vitest";
import {
  SYSTEM_NEWS,
  newsText,
  trendPrompt,
  awardPrompt,
  investmentPrompt,
  opinionPrompt,
} from "@/lib/services/prompts/legacy";
import type { NewsItem } from "@/lib/services/newsTypes";

const item: NewsItem = {
  title: "넷록스, 시리즈A 투자 유치",
  link: "https://www.etnews.com/1",
  description: "요약",
  content: "넷록스가 시리즈A 투자를 유치했다.",
  published: "2025-01-15T00:12:00.000Z",
  source: "전자신문",
  provider: "naver",
  titleMatch: true,
  mentions: 4,
  relevance: "primary",
};

describe("newsText", () => {
  it("lays out the five fields the legacy prompt expects", () => {
    const text = newsText(item);

    expect(text).toContain("뉴스 제목: 넷록스, 시리즈A 투자 유치");
    expect(text).toContain("뉴스 내용: 넷록스가 시리즈A 투자를 유치했다.");
    expect(text).toContain("출처: 전자신문");
    expect(text).toContain("링크: https://www.etnews.com/1");
  });
});

describe("trendPrompt", () => {
  it("keeps the legacy scoring rubric so scores stay comparable", () => {
    const prompt = trendPrompt("넷록스", item);

    expect(prompt).toContain("동향실적을 분석해주세요");
    expect(prompt).toContain("8~10: 매우 긍정적");
    expect(prompt).toContain("-8~-10: 매우 부정적");
    expect(prompt).toContain("반드시!!! 다음 JSON 형식으로 응답해주세요.");
  });

  it("asks whether the article is about the company before scoring it", () => {
    const prompt = trendPrompt("넷록스", item);

    expect(prompt).toContain("is_about_company");
    expect(prompt).toContain("'넷록스' 회사에 관한 기사인지 먼저 판단");
  });
});

describe("awardPrompt", () => {
  it("keeps the legacy guard that the company must have won it directly", () => {
    const prompt = awardPrompt("넷록스", item);

    expect(prompt).toContain("반드시 '넷록스' 회사가 직접 받은");
    expect(prompt).toContain("is_award_related");
  });
});

describe("investmentPrompt", () => {
  it("keeps the legacy guard that the investment must be the company's own", () => {
    const prompt = investmentPrompt("넷록스", item);

    expect(prompt).toContain("반드시 '넷록스' 회사가 직접 받거나 포함되어 받은 투자여야 합니다");
    expect(prompt).toContain("is_investment_related");
  });
});

describe("opinionPrompt", () => {
  it("hands the model the aggregate counts it must reason over", () => {
    const prompt = opinionPrompt("넷록스", {
      totalNews: 12,
      scoredNews: 9,
      averageSentiment: 5.2,
      positiveCount: 7,
      negativeCount: 1,
      neutralCount: 1,
      awardCount: 2,
      investmentCount: 1,
    });

    expect(prompt).toContain("넷록스");
    expect(prompt).toContain("12");
    expect(prompt).toContain("5.2");
    expect(prompt).toContain("comprehensive_opinion");
  });

  it("tells the model how many articles were excluded from the score", () => {
    const prompt = opinionPrompt("넷록스", {
      totalNews: 12,
      scoredNews: 9,
      averageSentiment: 5.2,
      positiveCount: 7,
      negativeCount: 1,
      neutralCount: 1,
      awardCount: 2,
      investmentCount: 1,
    });

    expect(prompt).toContain("3건");
  });
});

describe("SYSTEM_NEWS", () => {
  it("keeps the legacy system persona", () => {
    expect(SYSTEM_NEWS).toBe("당신은 뉴스 분석 전문가입니다. 정확하고 객관적으로 뉴스를 분석해주세요.");
  });
});
