import { describe, expect, it, vi } from "vitest";
import type { AnalyzeEvent } from "@/lib/services/analyzer";
import type { LlmClient } from "@/lib/services/llm";
import type { NewsItem } from "@/lib/services/newsTypes";
import type { JevAnswer, JevClient } from "@/lib/services/typesafe";
import { analyzeCompanyWithJev, buildArticleRequest, interpretAnswers, sentimentFromScore } from "@/lib/services/jevAnalyzer";

const PROFILE = { name: "크립토랩", officialName: "주식회사 크립토랩", industry: "사이버보안", ceoName: "천정희", aliases: ["CryptoLab"] };

const BODY = [
  "동형암호 기업 크립토랩이 200억원 규모의 시리즈B 투자를 유치했다고 28일 밝혔다.",
  "이번 투자에는 기존 투자사 3곳이 참여했다.",
  "크립토랩은 올해 매출이 전년보다 두 배 늘었다고 설명했다.",
  "크립토랩은 '2026 대한민국 혁신기업 대상'을 받았다.",
].join(" ");

const ITEM: NewsItem = {
  title: "크립토랩, 200억 시리즈B 유치",
  link: "https://n/1",
  description: "요약",
  content: BODY,
  published: "2026-08-28",
  source: "전자신문",
  provider: "naver",
  titleMatch: true,
  mentions: 3,
  relevance: "primary",
};

const noul = (value: number): JevAnswer => ({ type: "noul", noul: value });
const choice = (picked: string, probabilities: Record<string, number>, confidence = 0.9): JevAnswer => ({ type: "choice", choice: picked, confidence, probabilities });
const score = (value: number): JevAnswer => ({ type: "score", score: value, confidence: 0.8, probabilities: {} });

function answersFor(over: Record<string, JevAnswer> = {}): Record<string, JevAnswer> {
  return {
    same_entity: noul(0.95),
    role: choice("main", { main: 0.8, party: 0.1, many: 0.05, passing: 0.05, absent: 0 }),
    article_type: choice("single", { single: 0.9, roundup: 0.05, market: 0.05, notice: 0 }),
    sentiment: score(5),
    negative_kind: choice("none", { none: 1, lawsuit: 0, recall: 0, sanction: 0 }),
    award: noul(0.8),
    investment: noul(0.9),
    round: choice("series_b", { series_b: 0.9, none: 0.1 }),
    amount: choice("a0", { a0: 0.95, none: 0.05 }),
    award_name: choice("w0", { w0: 0.9, none: 0.1 }),
    summary: choice("s0", { s0: 0.7, s1: 0.3 }),
    g0: noul(0.1),
    g1: noul(0.2),
    g2: noul(0.9),
    g3: noul(0.3),
    ...over,
  };
}

describe("sentimentFromScore", () => {
  it("maps the seven rubric levels onto their -10..10 anchors and interpolates between them", () => {
    expect(sentimentFromScore(0)).toBe(-9);
    expect(sentimentFromScore(3)).toBe(0);
    expect(sentimentFromScore(6)).toBe(9);
    expect(sentimentFromScore(4.5)).toBeCloseTo(3.75);
  });
});

describe("buildArticleRequest", () => {
  it("asks every judgment together over one state that carries the company profile and mention sentences", () => {
    const { state, questions, context } = buildArticleRequest(PROFILE, ITEM);

    expect(state).toMatchObject({ company: { name: "크립토랩", industry: "사이버보안", ceo: "천정희", aliases: ["CryptoLab"] } });
    expect((state as { article: { mentions: string[] } }).article.mentions).toHaveLength(4);
    for (const id of ["same_entity", "role", "article_type", "sentiment", "negative_kind", "award", "investment", "round", "summary"]) {
      expect(questions[id]).toBeDefined();
    }
    expect(questions.amount).toMatchObject({ type: "choice", criteria: { a0: "200억원", none: expect.any(String) } });
    expect(questions.award_name).toMatchObject({ type: "choice" });
    expect(context.growth).toHaveLength(4);
    expect(questions.g0).toMatchObject({ type: "noul" });
  });

  it("leaves out the amount and award-name questions when the article offers no candidates", () => {
    const { questions } = buildArticleRequest(PROFILE, { ...ITEM, content: "크립토랩이 새 제품을 공개했다." });
    expect(questions.amount).toBeUndefined();
    expect(questions.award_name).toBeUndefined();
  });
});

describe("interpretAnswers", () => {
  const { context } = buildArticleRequest(PROFILE, ITEM);

  it("combines entity and role into the about-confidence and copies spans from the article", () => {
    const analysis = interpretAnswers(ITEM, context, answersFor());

    expect(analysis.trend.about_confidence).toBeCloseTo(0.855);
    expect(analysis.trend.is_about_company).toBe("Y");
    expect(analysis.isAboutCompany).toBe(true);
    expect(analysis.held).toBe(false);
    expect(analysis.trend.sentiment_score).toBe(6);
    expect(analysis.trend.sentiment_label).toBe("긍정적");
    expect(analysis.trend.news_trend_summary).toBe(context.summary[0]);
    expect(analysis.trend.growth_signals).toEqual([context.growth[2]]);
    expect(analysis.investment).toMatchObject({ is_investment_related: "Y", investment_round: "series_b", investment_amount_krw: 20_000_000_000, investment_name: "시리즈B" });
    expect(BODY).toContain(analysis.investment.investment_reason);
    expect(analysis.award).toMatchObject({ is_award_related: "Y", award_name: "2026 대한민국 혁신기업 대상" });
    expect(analysis.jev).toMatchObject({ sameEntity: 0.95, articleType: "single", sentimentScore: 5 });
  });

  it("holds an article whose about-confidence falls between the floor and the threshold", () => {
    const analysis = interpretAnswers(ITEM, context, answersFor({ role: choice("party", { main: 0.2, party: 0.3, many: 0.3, passing: 0.2, absent: 0 }) }));

    expect(analysis.trend.about_confidence).toBeCloseTo(0.475);
    expect(analysis.isAboutCompany).toBe(false);
    expect(analysis.held).toBe(true);
    expect(analysis.trend.growth_signals).toEqual([]);
  });

  it("rejects an article about a different company that shares the name", () => {
    const analysis = interpretAnswers(ITEM, context, answersFor({ same_entity: noul(0.1) }));

    expect(analysis.trend.is_about_company).toBe("N");
    expect(analysis.held).toBe(false);
    expect(analysis.isAboutCompany).toBe(false);
  });

  it("does not report an amount or round when Jev says the article is not about an investment", () => {
    const analysis = interpretAnswers(ITEM, context, answersFor({ investment: noul(0.2) }));

    expect(analysis.investment).toMatchObject({ is_investment_related: "N", investment_round: "none", investment_amount_krw: null, investment_name: "" });
  });
});

describe("analyzeCompanyWithJev", () => {
  const llm = (): LlmClient => ({
    json: vi.fn(async () => ({ data: { comprehensive_opinion: "종합의견" }, usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0 } })) as unknown as LlmClient["json"],
  });

  async function drain(generator: AsyncGenerator<AnalyzeEvent>) {
    const events: AnalyzeEvent[] = [];
    for await (const event of generator) events.push(event);
    return events;
  }

  it("judges every article with Jev, then writes the opinion with the LLM", async () => {
    const jev: JevClient = { ask: vi.fn(async () => ({ model: "jev-1.13.0", answers: answersFor(), inputTokens: 900 })) };
    const writer = llm();

    const events = await drain(analyzeCompanyWithJev("크립토랩", [ITEM, { ...ITEM, link: "https://n/2" }], { jev, llm: writer, model: "jev-latest+claude-sonnet-5", profile: PROFILE, facts: ["사실"] }));

    expect(jev.ask).toHaveBeenCalledTimes(2);
    expect(events.filter((event) => event.type === "news_done")).toHaveLength(2);
    const complete = events.at(-1);
    expect(complete?.type).toBe("complete");
    if (complete?.type !== "complete") return;
    expect(complete.result).toMatchObject({
      comprehensiveOpinion: "종합의견",
      model: "jev-latest+claude-sonnet-5",
      fallbacks: 0,
      facts: ["사실"],
      jev: { model: "jev-1.13.0", inputTokens: 1800 },
      stats: { totalNews: 2, scoredNews: 2, heldNews: 0, awardCount: 2, investmentCount: 2 },
    });
    expect(complete.result.usage.inputTokens).toBe(100);
  });

  it("fills a failed article with a neutral fallback and counts it", async () => {
    const jev: JevClient = {
      ask: vi.fn().mockRejectedValueOnce(new Error("Jev 529")).mockResolvedValueOnce({ model: "jev-1.13.0", answers: answersFor(), inputTokens: 900 }),
    };

    const events = await drain(analyzeCompanyWithJev("크립토랩", [ITEM, { ...ITEM, link: "https://n/2" }], { jev, llm: llm(), model: "m", profile: PROFILE, concurrency: 1 }));

    const complete = events.at(-1);
    if (complete?.type !== "complete") throw new Error("no complete event");
    expect(complete.result.fallbacks).toBe(1);
    expect(complete.result.stats.scoredNews).toBe(1);
  });

  it("reports an error when Jev answered nothing at all", async () => {
    const jev: JevClient = { ask: vi.fn(async () => Promise.reject(new Error("Jev 401"))) };

    const events = await drain(analyzeCompanyWithJev("크립토랩", [ITEM], { jev, llm: llm(), model: "m", profile: PROFILE }));

    expect(events.at(-1)).toMatchObject({ type: "error", message: expect.stringContaining("Jev 401") });
  });
});
