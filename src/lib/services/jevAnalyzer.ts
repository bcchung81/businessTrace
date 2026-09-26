import { z } from "zod";
import {
  INVESTMENT_ROUNDS,
  NEGATIVE_KINDS,
  ROUND_LABEL,
  isAboutCompany,
  isHeld,
  summarise,
  type AnalysisResult,
  type AnalyzeEvent,
  type InvestmentRound,
  type NegativeKind,
  type NewsAnalysis,
  type Trend,
} from "@/lib/services/analyzer";
import { amountCandidates, awardCandidates, mentionWindow, parseKrw, splitSentences, summaryCandidates } from "@/lib/services/jevCandidates";
import type { LlmClient, Usage } from "@/lib/services/llm";
import type { NewsItem } from "@/lib/services/newsTypes";
import { SYSTEM_NEWS, opinionPrompt } from "@/lib/services/prompts/legacy";
import type { JevAnswer, JevClient, JevQuestion } from "@/lib/services/typesafe";

export type CompanyProfile = { name: string; officialName?: string | null; industry?: string | null; ceoName?: string | null; aliases: string[] };

const GROWTH_MIN = 0.6;
const GROWTH_CAP = 8;
const SENTIMENT_ANCHORS = [-9, -5.5, -2, 0, 2, 5.5, 9];

const SENTIMENT_LEVELS = [
  "Very negative for the company's business: a serious crisis, a collapse in sales, a legal or management crisis",
  "Negative: worsening results, regulatory pressure, lost competitiveness",
  "Slightly negative: a small decline or competitive pressure",
  "Neutral: plain information or facts with no clear effect on the business",
  "Slightly positive: a small improvement or stable operation",
  "Positive: growth, new customers or markets, a favorable outlook",
  "Very positive: breakthrough results, market leadership, a large jump in sales or profit",
];

export type ArticleContext = { summary: string[]; amounts: string[]; awards: string[]; growth: string[]; sentences: string[] };

const option = (prefix: string, values: string[]) => Object.fromEntries(values.map((value, index) => [`${prefix}${index}`, value]));

/**
 * 기사 한 건에 대한 Jev 요청(state·질문)과 해석에 쓸 후보를 만든다. 질문은 서로 독립이라 한 요청에 모두 싣는다.
 * 주제 판정은 "같은 회사인가"와 "어떤 역할인가"로 나눠 묻고, 합치는 규칙은 코드(interpretAnswers)에 둔다.
 */
export function buildArticleRequest(profile: CompanyProfile, item: NewsItem) {
  const text = `${item.title}\n${item.content}`;
  const sentences = splitSentences(item.content);
  const names = [profile.name, ...profile.aliases];
  const window = mentionWindow(sentences, names);
  const context: ArticleContext = {
    summary: summaryCandidates(sentences, window.mentions),
    amounts: amountCandidates(text),
    awards: awardCandidates(text),
    growth: window.sentences.slice(0, GROWTH_CAP),
    sentences,
  };
  const state = {
    company: { name: profile.name, official_name: profile.officialName ?? null, industry: profile.industry ?? null, ceo: profile.ceoName ?? null, aliases: profile.aliases },
    article: { title: item.title, source: item.source, published: item.published, body: item.content, mentions: window.sentences },
  };

  const questions: Record<string, JevQuestion> = {
    same_entity: {
      type: "noul",
      instructions:
        "Does the name `company.name` as used in `article` refer to the company described in `company` (its industry, official name, CEO and aliases), rather than a different organization, brand, product, person or abbreviation that shares or contains the name?",
      criteria: { true: "The article's mentions refer to this company", false: "The mentions refer to something else, or the company is not mentioned" },
    },
    role: {
      type: "choice",
      instructions: "What role does the company in `company` play in `article`?",
      criteria: {
        main: "The article is mainly about this company",
        party: "One of a few explicitly named parties in the article's main event, such as a company selected, awarded, certified, or signing an agreement or contract",
        many: "One entry in a list of many organizations",
        passing: "Mentioned only in passing, as background or an aside",
        absent: "Not mentioned at all",
      },
    },
    article_type: {
      type: "choice",
      instructions: "What kind of article is `article`?",
      criteria: {
        single: "A news story about one event or topic",
        roundup: "A digest that bundles several unrelated news items",
        market: "An automated stock price, trading or disclosure report",
        notice: "An event notice, listing or program announcement",
      },
    },
    sentiment: {
      type: "score",
      instructions:
        "How does `article` bear on the business of the company in `company`? Judge the direction of the business itself; do not count the mere fact of receiving an award or an investment.",
      criteria: SENTIMENT_LEVELS,
    },
    negative_kind: {
      type: "choice",
      instructions: "Does `article` report a negative event for the company in `company`, and if so, which kind?",
      criteria: {
        lawsuit: "A lawsuit, litigation or legal dispute involving the company (소송·분쟁)",
        recall: "A product recall, defect, or quality or safety incident involving the company (리콜·품질 사고)",
        sanction: "A regulatory action, sanction, fine or penalty imposed on the company (규제·제재·과징금)",
        none: "None of these: the article is not negative for the company, or its negative content is of another kind",
      },
    },
    award: {
      type: "noul",
      instructions:
        "Does `article` report that the company in `company` itself received an award, prize or official honor (상, 시상, 수상, 어워드)? Awards given to other organizations or to people unrelated to the company do not count.",
    },
    investment: {
      type: "noul",
      instructions:
        "Does `article` report that the company in `company` itself received investment funding or took part in a funding event (투자 유치, 펀딩, a Series A/B/C round, an IPO)? Investments the company made into others, or funding of other organizations, do not count.",
    },
    round: {
      type: "choice",
      instructions: "Which investment round of the company in `company` does `article` state?",
      criteria: {
        seed: "A seed or pre-seed round",
        series_a: "A Series A or pre-A round",
        series_b: "A Series B round",
        series_c_plus: "A Series C or later round",
        ipo: "An IPO, stock market listing or listing preparation",
        other: "Another kind of investment for the company, such as a strategic investment, a government fund, or a round whose stage is not named",
        none: "The article reports no investment received by the company, or states no round",
      },
    },
    summary: {
      type: "choice",
      instructions: "Which sentence best states what `article` reports about the company in `company`?",
      criteria: option("s", context.summary.length > 0 ? context.summary : [item.title]),
    },
  };
  if (context.amounts.length > 0) {
    questions.amount = {
      type: "choice",
      instructions: "Which amount is the investment the company in `company` received, as written in `article`?",
      criteria: { ...option("a", context.amounts), none: "None of these is an investment the company received" },
    };
  }
  if (context.awards.length > 0) {
    questions.award_name = {
      type: "choice",
      instructions: "Which of these is the name of an award the company in `company` received, as written in `article`?",
      criteria: { ...option("w", context.awards), none: "None of these is an award the company received" },
    };
  }
  context.growth.forEach((sentence, index) => {
    questions[`g${index}`] = {
      type: "noul",
      instructions: {
        sentence,
        question:
          "Does this sentence from `article` state a concrete growth fact about the company in `company`, such as revenue, orders, customers, production capacity, overseas expansion or hiring?",
      },
    };
  });
  return { state, questions, context };
}

const noulOf = (answer: JevAnswer | undefined) => (answer?.type === "noul" ? answer.noul : 0);
const choiceOf = (answer: JevAnswer | undefined) => (answer?.type === "choice" ? answer : null);
const pickIndex = (answer: JevAnswer | undefined) => {
  const picked = choiceOf(answer)?.choice;
  return picked && picked !== "none" ? Number.parseInt(picked.slice(1), 10) : null;
};
const round3 = (value: number) => Math.round(value * 1000) / 1000;

/**
 * Jev 의 7단계 연속 점수(0~6)를 기존 루브릭 구간의 대표값 사이로 선형 보간해 -10~10 척도로 옮긴다.
 * 구간 의미가 보존되므로 사건 문턱(긍정 6·부정 -4)과 랭킹의 감성 축이 같은 뜻을 유지한다.
 */
export function sentimentFromScore(score: number): number {
  const clamped = Math.min(6, Math.max(0, score));
  const lower = Math.floor(clamped);
  if (lower >= 6) return SENTIMENT_ANCHORS[6];
  const fraction = clamped - lower;
  return SENTIMENT_ANCHORS[lower] + (SENTIMENT_ANCHORS[lower + 1] - SENTIMENT_ANCHORS[lower]) * fraction;
}

function sentimentLabel(score: number) {
  if (score >= 8) return "매우 긍정적";
  if (score >= 1) return "긍정적";
  if (score === 0) return "중립";
  if (score >= -7) return "부정적";
  return "매우 부정적";
}

const sentenceWith = (sentences: string[], span: string | null) => (span ? sentences.find((sentence) => sentence.includes(span)) ?? null : null);

/**
 * Jev 의 원답을 기존 분석 결과 모양으로 옮긴다. 금액·수상명·요약·성장 문장은 전부 원문에서 고른 스팬이다.
 * 주제 확신 = P(같은 회사) × P(주인공 또는 명시된 당사자). 문턱 미만·하한 이상은 보류로 표시해 집계에서 뺀다.
 * 사람이 주제로 판정한 기사(forced)는 Jev 의 답과 무관하게 주제다.
 */
export function interpretAnswers(item: NewsItem, context: ArticleContext, answers: Record<string, JevAnswer>, forced = false): NewsAnalysis {
  const sameEntity = noulOf(answers.same_entity);
  const role = choiceOf(answers.role)?.probabilities ?? {};
  const aboutConfidence = round3(sameEntity * ((role.main ?? 0) + (role.party ?? 0)));
  const rawScore = answers.sentiment?.type === "score" ? answers.sentiment.score : 3;
  const sentiment = Math.max(-10, Math.min(10, Math.round(sentimentFromScore(rawScore))));
  const kind = choiceOf(answers.negative_kind)?.choice ?? "none";
  const summaryIndex = pickIndex(answers.summary);
  const summary = context.summary[summaryIndex ?? 0] ?? item.title;

  const trend: Trend = {
    is_about_company: aboutConfidence >= 0.5 ? "Y" : "N",
    about_confidence: aboutConfidence,
    news_trend_summary: summary,
    sentiment_score: sentiment,
    sentiment_label: sentimentLabel(sentiment),
    negative_kind: (NEGATIVE_KINDS as readonly string[]).includes(kind) ? (kind as NegativeKind) : "none",
    growth_signals: [],
  };
  const about = forced || isAboutCompany(trend);
  if (about) trend.growth_signals = context.growth.filter((_, index) => noulOf(answers[`g${index}`]) >= GROWTH_MIN);

  const awardYes = noulOf(answers.award) >= 0.5;
  const awardIndex = awardYes ? pickIndex(answers.award_name) : null;
  const awardName = awardIndex === null ? "" : (context.awards[awardIndex] ?? "");

  const investmentYes = noulOf(answers.investment) >= 0.5;
  const roundChoice = choiceOf(answers.round)?.choice ?? "none";
  const round: InvestmentRound = investmentYes && (INVESTMENT_ROUNDS as readonly string[]).includes(roundChoice) ? (roundChoice as InvestmentRound) : "none";
  const amountIndex = investmentYes ? pickIndex(answers.amount) : null;
  const amountSpan = amountIndex === null ? null : (context.amounts[amountIndex] ?? null);

  return {
    news: item,
    isAboutCompany: about,
    trend,
    award: {
      is_award_related: awardYes ? "Y" : "N",
      award_name: awardName,
      award_reason: awardYes ? (sentenceWith(context.sentences, awardName || null) ?? summary) : "",
    },
    investment: {
      is_investment_related: investmentYes ? "Y" : "N",
      investment_name: investmentYes ? ROUND_LABEL[round] || "투자 유치" : "",
      investment_reason: investmentYes ? (sentenceWith(context.sentences, amountSpan) ?? summary) : "",
      investment_round: round,
      investment_amount_krw: amountSpan ? parseKrw(amountSpan) : null,
    },
    held: isHeld(trend, about),
    jev: { sameEntity, role, articleType: choiceOf(answers.article_type)?.choice ?? "single", sentimentScore: rawScore },
  };
}

function fallbackAnalysis(item: NewsItem): NewsAnalysis {
  return {
    news: item,
    isAboutCompany: false,
    trend: {
      is_about_company: "N",
      news_trend_summary: "Jev 판정에 실패해 중립으로 처리했습니다.",
      sentiment_score: 0,
      sentiment_label: "중립",
      negative_kind: "none",
      growth_signals: [],
    },
    award: { is_award_related: "N", award_name: "", award_reason: "" },
    investment: { is_investment_related: "N", investment_name: "", investment_reason: "", investment_round: "none", investment_amount_krw: null },
  };
}

const opinionSchema = z.object({ comprehensive_opinion: z.string() });
const NO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

type Deps = { jev: JevClient; llm: LlmClient; model: string; facts?: string[]; profile?: CompanyProfile; concurrency?: number; forceAbout?: ReadonlySet<string> };

/**
 * 기사마다 Jev 로 판정하고(요청 하나에 질문 묶음), 종합의견만 LLM 으로 쓴다. 이벤트 모양은 LLM 분석기와 같다.
 * 판정에 실패한 기사는 중립으로 메우되 센다 — 전부 실패하면 완료 대신 오류를 낸다.
 */
export async function* analyzeCompanyWithJev(companyName: string, news: NewsItem[], deps: Deps): AsyncGenerator<AnalyzeEvent> {
  if (news.length === 0) {
    yield { type: "error", message: "분석할 뉴스가 없습니다." };
    return;
  }
  const profile = deps.profile ?? { name: companyName, aliases: [] };
  const concurrency = Math.max(1, deps.concurrency ?? 4);
  const analyses = new Array<NewsAnalysis>(news.length);
  let fallbacks = 0;
  let lastFailure = "";
  let inputTokens = 0;
  let jevModel = "";

  for (let start = 0; start < news.length; start += concurrency) {
    const chunk = news.slice(start, start + concurrency);
    for (let offset = 0; offset < chunk.length; offset += 1) yield { type: "progress", step: "trend", current: start + offset + 1, total: news.length };
    const settled = await Promise.allSettled(
      chunk.map(async (item) => {
        const request = buildArticleRequest(profile, item);
        return { request, response: await deps.jev.ask(request.state, request.questions) };
      }),
    );
    for (const [offset, outcome] of settled.entries()) {
      const index = start + offset;
      if (outcome.status === "fulfilled") {
        inputTokens += outcome.value.response.inputTokens;
        jevModel = outcome.value.response.model;
        analyses[index] = interpretAnswers(news[index], outcome.value.request.context, outcome.value.response.answers, deps.forceAbout?.has(news[index].link) === true);
      } else {
        fallbacks += 1;
        lastFailure = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        analyses[index] = fallbackAnalysis(news[index]);
      }
      yield { type: "news_done", index, analysis: analyses[index] };
    }
  }

  if (fallbacks === news.length) {
    yield { type: "error", message: `Jev 판정이 ${fallbacks}건 모두 실패했습니다 — ${lastFailure}` };
    return;
  }

  const stats = { ...summarise(analyses), heldNews: analyses.filter((analysis) => analysis.held).length };
  yield { type: "progress", step: "opinion", current: news.length, total: news.length };
  let comprehensiveOpinion = "종합분석 생성에 실패했습니다.";
  let usage = NO_USAGE;
  try {
    const answer = await deps.llm.json({ system: SYSTEM_NEWS, prompt: opinionPrompt(companyName, stats, deps.facts ?? []), schema: opinionSchema });
    comprehensiveOpinion = answer.data.comprehensive_opinion;
    usage = answer.usage;
  } catch {
    fallbacks += 1;
  }

  const result: AnalysisResult = {
    companyName,
    model: deps.model,
    analyses,
    comprehensiveOpinion,
    stats,
    usage,
    fallbacks,
    ...(deps.facts && deps.facts.length > 0 ? { facts: deps.facts } : {}),
    jev: { model: jevModel, inputTokens },
  };
  yield { type: "complete", runId: 0, result };
}

