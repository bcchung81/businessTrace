import { describe, expect, it } from "vitest";
import type { NewsAnalysis } from "@/lib/services/analyzer";
import type { NewsItem } from "@/lib/services/newsTypes";
import {
  GATE_SET_KEY,
  JUDGMENT_QUESTIONS,
  applyJudgments,
  gateEnqueueRows,
  heldEnqueueRows,
  highlightSegments,
  judgmentPatchSchema,
  manualEnqueueRow,
  modelVerdict,
} from "@/lib/services/judgments";

function item(link: string, patch: Partial<NewsItem> = {}): NewsItem {
  return {
    title: `제목 ${link}`,
    link,
    description: "",
    content: `본문 ${link}`,
    published: "2026-09-20",
    source: "전자신문",
    provider: "naver",
    titleMatch: true,
    mentions: 2,
    relevance: "primary",
    ...patch,
  };
}

function analysis(link: string, patch: Partial<NewsAnalysis> = {}, confidence = 0.45): NewsAnalysis {
  return {
    news: item(link),
    isAboutCompany: false,
    trend: { is_about_company: "N", about_confidence: confidence, news_trend_summary: "요약", sentiment_score: 0, sentiment_label: "중립", negative_kind: "none", growth_signals: [] },
    award: { is_award_related: "N", award_name: "", award_reason: "" },
    investment: { is_investment_related: "N", investment_name: "", investment_reason: "", investment_round: "none", investment_amount_krw: null },
    ...patch,
  };
}

describe("JUDGMENT_QUESTIONS", () => {
  it("keeps the review page's four questions and keyboard keys", () => {
    expect(JUDGMENT_QUESTIONS.entity.map((option) => [option.value, option.key])).toEqual([["same", "1"], ["other", "2"], ["unclear", "3"]]);
    expect(JUDGMENT_QUESTIONS.role.map((option) => option.key)).toEqual(["Q", "W", "E", "R"]);
    expect(JUDGMENT_QUESTIONS.form.map((option) => option.value)).toEqual(["single", "roundup", "market", "broken"]);
    expect(JUDGMENT_QUESTIONS.about.map((option) => [option.value, option.key])).toEqual([["yes", "Y"], ["no", "N"], ["unsure", "U"]]);
  });
});

describe("judgmentPatchSchema", () => {
  it("accepts known answers and null, and rejects anything else", () => {
    expect(judgmentPatchSchema.safeParse({ about: "yes", entity: null, note: "메모" }).success).toBe(true);
    expect(judgmentPatchSchema.safeParse({ about: "maybe" }).success).toBe(false);
    expect(judgmentPatchSchema.safeParse({ verdict: "yes" }).success).toBe(false);
    expect(judgmentPatchSchema.safeParse({ note: "가".repeat(2001) }).success).toBe(false);
  });
});

describe("applyJudgments", () => {
  it("drops articles judged not about the company and forces the ones judged about it", () => {
    const news = [item("https://n/no"), item("https://n/yes", { relevance: "mention" }), item("https://n/untouched")];

    const applied = applyJudgments(news, { exclude: ["https://n/no"], include: ["https://n/yes", "https://n/not-collected"] });

    expect(applied.news.map((entry) => entry.link)).toEqual(["https://n/yes", "https://n/untouched"]);
    expect(applied.news[0].relevance).toBe("primary");
    expect([...applied.forceAbout]).toEqual(["https://n/yes"]);
  });
});

describe("heldEnqueueRows", () => {
  it("queues only held articles with a snapshot and the analyzer's answer", () => {
    const rows = heldEnqueueRows({
      companyId: 7,
      runId: 312,
      formulaVersion: "v3-jev",
      analyses: [analysis("https://n/held", { held: true }), analysis("https://n/out", {}, 0.1)],
    });

    expect(rows).toEqual([
      {
        companyId: 7,
        link: "https://n/held",
        title: "제목 https://n/held",
        source: "전자신문",
        published: "2026-09-20",
        body: "본문 https://n/held",
        origin: "held",
        model: { analyzer: "jev", formulaVersion: "v3-jev", runId: 312, isAbout: false, held: true, confidence: 0.45 },
      },
    ]);
  });
});

describe("manualEnqueueRow", () => {
  it("records what the analyzer said about an article someone picked by hand", () => {
    const row = manualEnqueueRow({ companyId: 7, runId: 330, formulaVersion: "v2-anthropic", analysis: analysis("https://n/1", { isAboutCompany: true }, 0.92) });

    expect(row).toMatchObject({ origin: "manual", link: "https://n/1", model: { analyzer: "llm", runId: 330, isAbout: true, held: false, confidence: 0.92 } });
  });
});

describe("modelVerdict", () => {
  it("says what the analyzer decided, how sure it was and which run", () => {
    expect(modelVerdict(JSON.stringify({ analyzer: "llm", runId: 312, isAbout: false, held: true, confidence: 0.45 }))).toBe("분석기: 보류 · 확신 0.45 · LLM · 실행 #312");
    expect(modelVerdict(JSON.stringify({ analyzer: "jev", runId: 360, isAbout: true, held: false, confidence: 0.923 }))).toBe("분석기: 주제 · 확신 0.92 · Jev · 실행 #360");
    expect(modelVerdict(JSON.stringify({ analyzer: "llm", runId: 5, isAbout: false, held: false, confidence: 0.1 }))).toBe("분석기: 주제 아님 · 확신 0.10 · LLM · 실행 #5");
  });

  it("shows both first-round answers for a gate article", () => {
    expect(modelVerdict(JSON.stringify({ gate: true, sonnet: { yn: "N", conf: 0.2, isAbout: 0 }, jevFirst: 0.22 }))).toBe("Sonnet: 주제 아님(0.20) · Jev 1차 0.22");
  });

  it("admits it has nothing when the record is broken", () => {
    expect(modelVerdict("{broken")).toBe("분석기 답이 기록되지 않았습니다");
  });
});

describe("highlightSegments", () => {
  it("marks the company name and its aliases without changing the text", () => {
    const text = "누아엔터와 달리 누아는 NUA 클라우드를 낸다. 서 덕 진 대표";

    const segments = highlightSegments(text, ["누아", "nua", "서덕진"]);

    expect(segments.map((segment) => segment.text).join("")).toBe(text);
    expect(segments.filter((segment) => segment.mark).map((segment) => segment.text)).toEqual(["누아", "누아", "NUA", "서 덕 진"]);
  });

  it("returns the text as one plain segment when there is nothing to mark", () => {
    expect(highlightSegments("관련 없는 문장", ["누아"])).toEqual([{ text: "관련 없는 문장", mark: false }]);
  });
});

describe("gateEnqueueRows", () => {
  it("joins the review items with their keys into gate rows", () => {
    const rows = gateEnqueueRows(
      [{ id: "g001", required: true, company: "비햅틱스", industry: "SW", officialName: "주식회사 비햅틱스", ceo: "곽기욱", aliases: [], title: "제목", source: "뉴스핌", published: "2026-06-10", link: "https://n/g1", body: "본문" }],
      [{ id: "g001", stratum: "B", companyId: 27, link: "https://n/g1", sonnet: { yn: "N", conf: 0.2, isAbout: 0 }, jev: 0.22 }],
    );

    expect(rows).toEqual([
      {
        companyId: 27,
        link: "https://n/g1",
        title: "제목",
        source: "뉴스핌",
        published: "2026-06-10",
        body: "본문",
        origin: "gate",
        setKey: GATE_SET_KEY,
        stratum: "B",
        required: true,
        model: { gate: true, sonnet: { yn: "N", conf: 0.2, isAbout: 0 }, jevFirst: 0.22 },
      },
    ]);
  });
});
