import { z } from "zod";
import type { LlmClient, Usage } from "@/lib/services/llm";
import { resolveModel } from "@/lib/services/llm";
import type { NewsItem } from "@/lib/services/newsTypes";
import {
  SYSTEM_NEWS,
  awardPrompt,
  investmentPrompt,
  newsContext,
  opinionPrompt,
  trendPrompt,
} from "@/lib/services/prompts/legacy";

const yesNo = z.union([z.literal("Y"), z.literal("N")]);

const trendSchema = z.object({
  trend_analysis: z.object({
    is_about_company: yesNo,
    news_trend_summary: z.string(),
    sentiment_score: z.number().int().min(-10).max(10),
    sentiment_label: z.string(),
  }),
});

const awardSchema = z.object({
  award_analysis: z.object({
    is_award_related: yesNo,
    award_name: z.string(),
    award_reason: z.string(),
  }),
});

const investmentSchema = z.object({
  investment_analysis: z.object({
    is_investment_related: yesNo,
    investment_name: z.string(),
    investment_reason: z.string(),
  }),
});

const opinionSchema = z.object({ comprehensive_opinion: z.string() });

export type Trend = z.infer<typeof trendSchema>["trend_analysis"];
export type Award = z.infer<typeof awardSchema>["award_analysis"];
export type Investment = z.infer<typeof investmentSchema>["investment_analysis"];

export type NewsAnalysis = {
  news: NewsItem;
  isAboutCompany: boolean;
  trend: Trend;
  award: Award;
  investment: Investment;
};

export type AnalysisStats = {
  totalNews: number;
  scoredNews: number;
  excludedNews: number;
  averageSentiment: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  awardCount: number;
  investmentCount: number;
};

export type AnalysisResult = {
  companyName: string;
  model: string;
  analyses: NewsAnalysis[];
  comprehensiveOpinion: string;
  stats: AnalysisStats;
  usage: Usage;
};

export type AnalyzeStep = "trend" | "award" | "investment" | "opinion";

export type AnalyzeEvent =
  | { type: "progress"; step: AnalyzeStep; current: number; total: number }
  | { type: "news_done"; index: number; analysis: NewsAnalysis }
  | { type: "complete"; runId: number; result: AnalysisResult }
  | { type: "error"; message: string };

const NEUTRAL_TREND: Trend = {
  is_about_company: "N",
  news_trend_summary: "동향실적 분석에 실패해 중립으로 처리했습니다.",
  sentiment_score: 0,
  sentiment_label: "중립",
};

const NO_AWARD: Award = {
  is_award_related: "N",
  award_name: "",
  award_reason: "수상실적 분석에 실패했습니다.",
};

const NO_INVESTMENT: Investment = {
  is_investment_related: "N",
  investment_name: "",
  investment_reason: "투자실적 분석에 실패했습니다.",
};

function addUsage(total: Usage, next: Usage): Usage {
  return {
    inputTokens: total.inputTokens + next.inputTokens,
    outputTokens: total.outputTokens + next.outputTokens,
    cacheReadTokens: total.cacheReadTokens + next.cacheReadTokens,
  };
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function summarise(analyses: NewsAnalysis[]): AnalysisStats {
  const about = analyses.filter((analysis) => analysis.isAboutCompany);
  const scores = about.map((analysis) => analysis.trend.sentiment_score);
  const total = scores.reduce((sum, score) => sum + score, 0);

  return {
    totalNews: analyses.length,
    scoredNews: about.length,
    excludedNews: analyses.length - about.length,
    averageSentiment: about.length === 0 ? 0 : round(total / about.length),
    positiveCount: scores.filter((score) => score > 0).length,
    negativeCount: scores.filter((score) => score < 0).length,
    neutralCount: scores.filter((score) => score === 0).length,
    awardCount: about.filter((analysis) => analysis.award.is_award_related === "Y").length,
    investmentCount: about.filter((analysis) => analysis.investment.is_investment_related === "Y").length,
  };
}

/**
 * 뉴스별 3분석과 종합의견을 만들며 진행 상황을 흘린다.
 * 회사가 주제가 아닌 기사는 집계에서 빼되 결과에는 남긴다.
 */
type Deps = { llm: LlmClient; model?: string; concurrency?: number };

function eventQueue() {
  const buffer: AnalyzeEvent[] = [];
  let wake: (() => void) | null = null;
  return {
    push(event: AnalyzeEvent) {
      buffer.push(event);
      wake?.();
      wake = null;
    },
    async next() {
      if (buffer.length === 0) await new Promise<void>((resolve) => (wake = resolve));
      return buffer.shift();
    },
    get size() {
      return buffer.length;
    },
  };
}

/**
 * 뉴스별 3분석과 종합의견을 만들며 진행 상황을 흘린다.
 * 회사가 주제가 아닌 기사는 집계에서 빼되 결과에는 남긴다.
 * 기사는 최대 concurrency 개를 동시에 돌리고, 기사 안에서는 동향을 먼저 물어 캐시를 만든 뒤 수상·투자를 함께 묻는다.
 */
export async function* analyzeCompany(
  companyName: string,
  news: NewsItem[],
  deps: Deps,
): AsyncGenerator<AnalyzeEvent> {
  if (news.length === 0) {
    yield { type: "error", message: "분석할 뉴스가 없습니다." };
    return;
  }

  const model = deps.model ?? resolveModel();
  const analyses = new Array<NewsAnalysis>(news.length);
  let usage: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

  async function ask<T>(prompt: string, schema: z.ZodType<T>, fallback: T, context?: string): Promise<T> {
    try {
      const answer = await deps.llm.json({ system: SYSTEM_NEWS, context, prompt, schema });
      usage = addUsage(usage, answer.usage);
      return answer.data;
    } catch {
      return fallback;
    }
  }

  const queue = eventQueue();
  const total = news.length;
  const concurrency = Math.max(1, deps.concurrency ?? 4);
  let cursor = 0;

  async function analyseOne(index: number) {
    const item = news[index];
    const position = index + 1;
    const context = newsContext(companyName, item);

    queue.push({ type: "progress", step: "trend", current: position, total });
    const trend = (
      await ask(trendPrompt(companyName, item), trendSchema, { trend_analysis: NEUTRAL_TREND }, context)
    ).trend_analysis;

    queue.push({ type: "progress", step: "award", current: position, total });
    const [award, investment] = await Promise.all([
      ask(awardPrompt(companyName, item), awardSchema, { award_analysis: NO_AWARD }, context).then(
        (answer) => answer.award_analysis,
      ),
      ask(
        investmentPrompt(companyName, item),
        investmentSchema,
        { investment_analysis: NO_INVESTMENT },
        context,
      ).then((answer) => answer.investment_analysis),
    ]);

    const analysis: NewsAnalysis = {
      news: item,
      isAboutCompany: trend.is_about_company === "Y",
      trend,
      award,
      investment,
    };
    analyses[index] = analysis;
    queue.push({ type: "news_done", index, analysis });
  }

  const workers = Promise.all(
    Array.from({ length: Math.min(concurrency, total) }, async () => {
      while (cursor < total) {
        const index = cursor;
        cursor += 1;
        await analyseOne(index);
      }
    }),
  );

  let finished = false;
  void workers.then(() => {
    finished = true;
    queue.push({ type: "progress", step: "opinion", current: total, total });
  });

  while (!finished || queue.size > 0) {
    const event = await queue.next();
    if (!event) continue;
    if (event.type === "progress" && event.step === "opinion") break;
    yield event;
  }
  await workers;

  const stats = summarise(analyses);

  yield { type: "progress", step: "opinion", current: news.length, total: news.length };
  const opinion = await ask(opinionPrompt(companyName, stats), opinionSchema, {
    comprehensive_opinion: "종합분석 생성에 실패했습니다.",
  });

  yield {
    type: "complete",
    runId: 0,
    result: {
      companyName,
      model,
      analyses,
      comprehensiveOpinion: opinion.comprehensive_opinion,
      stats,
      usage,
    },
  };
}
