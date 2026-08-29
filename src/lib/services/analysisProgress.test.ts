import { describe, it, expect } from "vitest";
import { INITIAL_RUN, reduceAnalysis, type RunState } from "@/lib/services/analysisProgress";

const ANALYSIS = {
  news: { title: "크립토랩 투자 유치", link: "https://n.example/1", source: "전자신문" },
  isAboutCompany: true,
  trend: { is_about_company: "Y", news_trend_summary: "요약", sentiment_score: 8, sentiment_label: "긍정" },
  award: { is_award_related: "N", award_name: "", award_reason: "" },
  investment: { is_investment_related: "Y", investment_name: "시리즈B", investment_reason: "" },
};

const RESULT = {
  companyName: "크립토랩",
  model: "claude-sonnet-5",
  analyses: [ANALYSIS],
  comprehensiveOpinion: "종합 의견",
  stats: { totalNews: 18, scoredNews: 14, excludedNews: 4, averageSentiment: 6.2 },
  usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 0 },
};

function run(events: unknown[]): RunState {
  return events.reduce<RunState>((state, event) => reduceAnalysis(state, event), INITIAL_RUN);
}

describe("reduceAnalysis", () => {
  it("starts idle with nothing collected", () => {
    expect(INITIAL_RUN).toMatchObject({ phase: "idle", runId: null, analyses: [] });
  });

  it("moves to analysing once the collection event lands", () => {
    const state = run([
      { type: "collected", runId: 7, duplicatesRemoved: 3, primaryCount: 12, noNews: false, errors: [] },
    ]);

    expect(state).toMatchObject({ phase: "analyzing", runId: 7 });
    expect(state.collected).toMatchObject({ duplicatesRemoved: 3, primaryCount: 12 });
  });

  it("records the step and how far into it the run is", () => {
    const state = run([{ type: "progress", step: "trend", current: 12, total: 24 }]);

    expect(state).toMatchObject({ step: "trend", current: 12, total: 24 });
  });

  it("stacks each finished article in the order it arrives", () => {
    const state = run([
      { type: "news_done", index: 0, analysis: ANALYSIS },
      { type: "news_done", index: 1, analysis: { ...ANALYSIS, isAboutCompany: false } },
    ]);

    expect(state.analyses).toHaveLength(2);
    expect(state.analyses[1].isAboutCompany).toBe(false);
  });

  it("keeps the statistics and the written opinion when the analysis completes", () => {
    const state = run([{ type: "complete", runId: 7, result: RESULT }]);

    expect(state.stats).toMatchObject({ totalNews: 18, excludedNews: 4 });
    expect(state.opinion).toBe("종합 의견");
  });

  it("ends on the verification verdict", () => {
    const verification = { status: "verified", faithfulness: 0.92, sourceCoverage: 1, evidenceMatch: 0.47 };
    const state = run([{ type: "verifying", runId: 7 }, { type: "verified", runId: 7, verification }]);

    expect(state.phase).toBe("done");
    expect(state.verification).toMatchObject({ status: "verified" });
  });

  it("finishes a failed verification without a verdict, because a failed check is not a pass", () => {
    const state = run([
      { type: "verifying", runId: 7 },
      { type: "verification_failed", runId: 7, message: "judge 응답 오류" },
    ]);

    expect(state).toMatchObject({ phase: "done", verification: null });
    expect(state.message).toContain("judge 응답 오류");
  });

  it("ends the run as failed when the server reports an error", () => {
    const state = run([{ type: "error", message: "분석 중 오류가 발생했습니다." }]);

    expect(state).toMatchObject({ phase: "failed" });
    expect(state.message).toContain("오류");
  });

  it("logs a collection warning instead of hiding it", () => {
    const state = run([
      {
        type: "collected",
        runId: 7,
        duplicatesRemoved: 0,
        primaryCount: 0,
        noNews: true,
        errors: ["네이버 응답 429"],
      },
    ]);

    expect(state.log.some((entry) => entry.level === "warn" && entry.text.includes("429"))).toBe(true);
    expect(state.log.some((entry) => entry.text.includes("수집된 기사가 없"))).toBe(true);
  });

  it("leaves the state alone for an event it does not know", () => {
    const state = run([{ type: "something-else" }]);

    expect(state).toEqual(INITIAL_RUN);
  });

  it("leaves the state alone for a payload that is not an event object", () => {
    expect(reduceAnalysis(INITIAL_RUN, "nonsense")).toEqual(INITIAL_RUN);
  });
});
