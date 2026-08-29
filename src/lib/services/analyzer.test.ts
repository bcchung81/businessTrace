import { describe, it, expect, vi } from "vitest";
import { analyzeCompany } from "@/lib/services/analyzer";
import type { AnalyzeEvent } from "@/lib/services/analyzer";
import type { LlmClient } from "@/lib/services/llm";
import type { NewsItem } from "@/lib/services/newsTypes";

function news(patch: Partial<NewsItem> = {}): NewsItem {
  return {
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
    ...patch,
  };
}

type TrendOverride = { isAbout?: "Y" | "N"; score?: number; label?: string };

function fakeLlm(trendFor: (prompt: string) => TrendOverride = () => ({})) {
  const usage = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0 };
  return {
    json: vi.fn(async ({ prompt, context = "" }: { prompt: string; context?: string }) => {
      if (prompt.includes("동향실적을 분석해주세요")) {
        const override = trendFor(`${context}\n${prompt}`);
        return {
          data: {
            trend_analysis: {
              is_about_company: override.isAbout ?? "Y",
              news_trend_summary: "요약",
              sentiment_score: override.score ?? 6,
              sentiment_label: override.label ?? "긍정적",
            },
          },
          usage,
        };
      }
      if (prompt.includes("수상을 받았는지 찾아주세요")) {
        return {
          data: {
            award_analysis: { is_award_related: "Y", award_name: "대상", award_reason: "이유" },
          },
          usage,
        };
      }
      if (prompt.includes("투자 관련 정보를 찾아주세요")) {
        return {
          data: {
            investment_analysis: {
              is_investment_related: "N",
              investment_name: "",
              investment_reason: "이유",
            },
          },
          usage,
        };
      }
      return { data: { comprehensive_opinion: "종합분석" }, usage };
    }),
  } as unknown as LlmClient;
}

async function drain(generator: AsyncGenerator<AnalyzeEvent>) {
  const events: AnalyzeEvent[] = [];
  for await (const event of generator) events.push(event);
  return events;
}

function complete(events: AnalyzeEvent[]) {
  const last = events.at(-1);
  if (last?.type !== "complete") throw new Error(`expected complete, got ${last?.type}`);
  return last;
}

describe("analyzeCompany", () => {
  it("emits progress, one result per article, then the completed analysis", async () => {
    const events = await drain(analyzeCompany("넷록스", [news(), news({ title: "두 번째" })], { llm: fakeLlm() }));

    const types = events.map((event) => event.type);
    expect(types.filter((type) => type === "news_done")).toHaveLength(2);
    expect(types.indexOf("progress")).toBeLessThan(types.indexOf("news_done"));
    expect(types.at(-1)).toBe("complete");
  });

  it("stops immediately when there is nothing to analyse", async () => {
    const events = await drain(analyzeCompany("넷록스", [], { llm: fakeLlm() }));

    expect(events).toEqual([{ type: "error", message: "분석할 뉴스가 없습니다." }]);
  });

  it("excludes an article the model says is not about the company from the sentiment average", async () => {
    const events = await drain(
      analyzeCompany("옥타코", [news({ title: "옥타코 수상" }), news({ title: "SK쉴더스 해킹" })], {
        llm: fakeLlm((prompt) =>
          prompt.includes("SK쉴더스") ? { isAbout: "N", score: -6, label: "부정적" } : { score: 8 },
        ),
      }),
    );

    const result = complete(events).result;
    expect(result.stats.scoredNews).toBe(1);
    expect(result.stats.averageSentiment).toBe(8);
  });

  it("keeps the excluded article in the report instead of hiding it", async () => {
    const events = await drain(
      analyzeCompany("옥타코", [news({ title: "SK쉴더스 해킹" })], {
        llm: fakeLlm(() => ({ isAbout: "N", score: -6 })),
      }),
    );

    const result = complete(events).result;
    expect(result.analyses).toHaveLength(1);
    expect(result.analyses[0].isAboutCompany).toBe(false);
    expect(result.stats.excludedNews).toBe(1);
  });

  it("counts awards and investments only from articles about the company", async () => {
    const events = await drain(
      analyzeCompany("옥타코", [news({ title: "SK쉴더스 해킹" })], {
        llm: fakeLlm(() => ({ isAbout: "N" })),
      }),
    );

    expect(complete(events).result.stats.awardCount).toBe(0);
  });

  it("falls back to a neutral score when one call fails and still completes", async () => {
    const llm = fakeLlm();
    (llm.json as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("429 rate limited"));

    const events = await drain(analyzeCompany("넷록스", [news()], { llm }));

    const done = events.find((event) => event.type === "news_done");
    expect(done?.type === "news_done" && done.analysis.trend.sentiment_score).toBe(0);
    expect(complete(events).result.analyses).toHaveLength(1);
  });

  it("sums token usage across every call so cost is visible per run", async () => {
    const events = await drain(analyzeCompany("넷록스", [news()], { llm: fakeLlm() }));

    expect(complete(events).result.usage.inputTokens).toBe(40);
  });

  it("reports the model it used so the formula version stays traceable", async () => {
    const events = await drain(analyzeCompany("넷록스", [news()], { llm: fakeLlm(), model: "claude-opus-5" }));

    expect(complete(events).result.model).toBe("claude-opus-5");
  });

  it("still produces an opinion when no article survives the company check", async () => {
    const events = await drain(
      analyzeCompany("옥타코", [news({ title: "SK쉴더스 해킹" })], {
        llm: fakeLlm(() => ({ isAbout: "N" })),
      }),
    );

    const result = complete(events).result;
    expect(result.stats.averageSentiment).toBe(0);
    expect(result.comprehensiveOpinion).toBe("종합분석");
  });
});

describe("analyzeCompany — prompt caching", () => {
  it("sends the article as a shared context block and keeps the task prompt free of it", async () => {
    const llm = fakeLlm();
    const item = news({ content: "아주 긴 기사 본문 ".repeat(3) });

    for await (const _ of analyzeCompany("크립토랩", [item], { llm, model: "m" })) {
      void _;
    }

    const calls = (llm.json as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => call[0] as { context?: string; prompt: string },
    );
    const perArticle = calls.slice(0, 3);
    expect(perArticle.every((request) => request.context?.includes("아주 긴 기사 본문"))).toBe(true);
    expect(perArticle.every((request) => !request.prompt.includes("아주 긴 기사 본문"))).toBe(true);
    expect(new Set(perArticle.map((request) => request.context)).size).toBe(1);
  });
});

describe("analyzeCompany — parallelism", () => {
  type Gate = { resolve: () => void; promise: Promise<void> };
  function gate(): Gate {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { resolve, promise };
  }

  function trackingLlm(onCall: (kind: "trend" | "award" | "investment" | "opinion") => Promise<void>) {
    const usage = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 };
    return {
      json: vi.fn(async ({ prompt }: { prompt: string }) => {
        if (prompt.includes("동향실적을 분석해주세요")) {
          await onCall("trend");
          return { data: { trend_analysis: { is_about_company: "Y", news_trend_summary: "요약", sentiment_score: 5, sentiment_label: "긍정적" } }, usage };
        }
        if (prompt.includes("수상을 받았는지 찾아주세요")) {
          await onCall("award");
          return { data: { award_analysis: { is_award_related: "N", award_name: "", award_reason: "" } }, usage };
        }
        if (prompt.includes("투자 관련 정보를 찾아주세요")) {
          await onCall("investment");
          return { data: { investment_analysis: { is_investment_related: "N", investment_name: "", investment_reason: "" } }, usage };
        }
        await onCall("opinion");
        return { data: { comprehensive_opinion: "의견" }, usage };
      }),
    } as unknown as LlmClient;
  }

  it("asks award and investment at the same time once the trend call has warmed the cache", async () => {
    const inFlight = new Set<string>();
    let sawBothTogether = false;
    let awardStartedBeforeTrendFinished = false;
    let trendDone = false;
    const llm = trackingLlm(async (kind) => {
      if (kind === "award" && !trendDone) awardStartedBeforeTrendFinished = true;
      inFlight.add(kind);
      if (inFlight.has("award") && inFlight.has("investment")) sawBothTogether = true;
      await new Promise((tick) => setTimeout(tick, 5));
      inFlight.delete(kind);
      if (kind === "trend") trendDone = true;
    });

    await drain(analyzeCompany("넷록스", [news()], { llm }));

    expect(sawBothTogether).toBe(true);
    expect(awardStartedBeforeTrendFinished).toBe(false);
  });

  it("works on up to four articles at once and never more", async () => {
    let inFlight = 0;
    let peak = 0;
    const llm = trackingLlm(async (kind) => {
      if (kind !== "trend") return;
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((tick) => setTimeout(tick, 10));
      inFlight -= 1;
    });
    const items = Array.from({ length: 9 }, (_, i) => news({ title: `기사 ${i}`, link: `https://n/${i}` }));

    await drain(analyzeCompany("넷록스", items, { llm, concurrency: 4 }));

    expect(peak).toBe(4);
  });

  it("keeps analyses in the original article order however the calls finish", async () => {
    const delays = [30, 5, 20];
    const llm = trackingLlm(async () => {});
    (llm.json as ReturnType<typeof vi.fn>).mockImplementation(async ({ context = "", prompt }: { context?: string; prompt: string }) => {
      const index = Number(/기사 (\d)/.exec(context)?.[1] ?? 0);
      await new Promise((tick) => setTimeout(tick, delays[index] ?? 0));
      if (prompt.includes("동향실적을 분석해주세요")) return { data: { trend_analysis: { is_about_company: "Y", news_trend_summary: `요약 ${index}`, sentiment_score: index, sentiment_label: "긍정적" } }, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 } };
      if (prompt.includes("수상을 받았는지 찾아주세요")) return { data: { award_analysis: { is_award_related: "N", award_name: "", award_reason: "" } }, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 } };
      if (prompt.includes("투자 관련 정보를 찾아주세요")) return { data: { investment_analysis: { is_investment_related: "N", investment_name: "", investment_reason: "" } }, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 } };
      return { data: { comprehensive_opinion: "의견" }, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 } };
    });
    const items = [0, 1, 2].map((i) => news({ title: `기사 ${i}`, link: `https://n/${i}` }));

    const events = await drain(analyzeCompany("넷록스", items, { llm, concurrency: 3 }));

    expect(complete(events).result.analyses.map((a) => a.trend.news_trend_summary)).toEqual(["요약 0", "요약 1", "요약 2"]);
    expect(events.filter((e) => e.type === "news_done")).toHaveLength(3);
    expect(events.at(-1)?.type).toBe("complete");
  });
});
