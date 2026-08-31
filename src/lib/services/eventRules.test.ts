import { describe, expect, it } from "vitest";
import type { AnalysisResult, NewsAnalysis } from "@/lib/services/analyzer";
import type { StoredSnapshot } from "@/lib/repositories/sourceSnapshot";
import {
  isSameStory,
  compareSeverity, dashboardEvents, extractAnalysisEvents, extractPensionEvents, extractSourceEvents,
  HEADCOUNT_RATIO, NEGATIVE_PRESS_MAX, POSITIVE_PRESS_MIN, type EventKind,
} from "@/lib/services/eventRules";

const NOW = new Date("2026-08-30T00:00:00.000Z");

function analysis(over: { link: string; about?: boolean; score?: number; award?: string; investment?: string; title?: string }): NewsAnalysis {
  return {
    news: { title: over.title ?? "기사", link: over.link, description: "", content: "본문", published: "2026-08-26T00:00:00.000Z", source: "전자신문", provider: "naver", titleMatch: true, mentions: 2, relevance: "primary" },
    isAboutCompany: over.about ?? true,
    trend: { is_about_company: over.about === false ? "N" : "Y", news_trend_summary: "요약", sentiment_score: over.score ?? 0, sentiment_label: "중립" },
    award: { is_award_related: over.award ? "Y" : "N", award_name: over.award ?? "", award_reason: "" },
    investment: { is_investment_related: over.investment ? "Y" : "N", investment_name: over.investment ?? "", investment_reason: "" },
  };
}

function result(analyses: NewsAnalysis[]): AnalysisResult {
  return { companyName: "딥노이드", model: "m", analyses, comprehensiveOpinion: "", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
    stats: { totalNews: analyses.length, scoredNews: analyses.length, excludedNews: 0, averageSentiment: 0, positiveCount: 0, negativeCount: 0, neutralCount: 0, awardCount: 0, investmentCount: 0 } };
}

describe("isSameStory", () => {
  const base = { companyId: 1, kind: "positive_press" as const, occurredAt: new Date("2026-08-20"), title: "긍정 보도 — 오토노머스에이투지, 중기부 '글로벌 팁스' 선정" };

  it("matches a differently-worded headline of the same story within a week", () => {
    expect(isSameStory(base, { ...base, occurredAt: new Date("2026-08-21"), title: "긍정 보도 — 오토노머스에이투지, '글로벌 팁스' 선정…66억 규모 레벨4" })).toBe(true);
  });

  it("rejects the same wording a month apart", () => {
    expect(isSameStory(base, { ...base, occurredAt: new Date("2026-09-25") })).toBe(false);
  });

  it("rejects a different story of the same kind", () => {
    const a = { ...base, title: "긍정 보도 — 무암, 시리즈B 투자 유치" };
    expect(isSameStory(a, { ...a, title: "긍정 보도 — 무암, 신임 CTO 영입" })).toBe(false);
  });

  it("rejects another company, another kind, and non-news kinds", () => {
    expect(isSameStory(base, { ...base, companyId: 2 })).toBe(false);
    expect(isSameStory(base, { ...base, kind: "award" })).toBe(false);
    const closure = { ...base, kind: "closure" as const, title: "휴·폐업 — 폐업" };
    expect(isSameStory(closure, { ...closure })).toBe(false);
  });
});

describe("extractAnalysisEvents", () => {
  it("turns an award into a positive event carrying the article as evidence and the run's trust", () => {
    const events = extractAnalysisEvents({ companyId: 1, runId: 9, result: result([analysis({ link: "https://n/1", award: "CES 혁신상" })]), trust: "verified" });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "award", severity: "positive", title: "수상 — CES 혁신상", evidenceKey: "https://n/1", runId: 9, trust: "verified", occurredAt: new Date("2026-08-26T00:00:00.000Z") });
    expect(events[0].evidence[0]).toEqual({ label: "CES 혁신상", link: "https://n/1" });
  });

  it("emits investment, positive and negative press by their thresholds", () => {
    const events = extractAnalysisEvents({ companyId: 1, runId: 9, trust: "needs_review", result: result([
      analysis({ link: "https://n/1", investment: "시리즈B 200억" }),
      analysis({ link: "https://n/2", score: POSITIVE_PRESS_MIN, title: "매출 급증" }),
      analysis({ link: "https://n/3", score: POSITIVE_PRESS_MIN - 1 }),
      analysis({ link: "https://n/4", score: NEGATIVE_PRESS_MAX, title: "자본잠식 우려" }),
      analysis({ link: "https://n/5", score: NEGATIVE_PRESS_MAX + 1 }),
    ]) });

    expect(events.map((e) => [e.kind, e.evidenceKey])).toEqual([
      ["investment", "https://n/1"], ["positive_press", "https://n/2"], ["negative_press", "https://n/4"],
    ]);
    expect(events.find((e) => e.kind === "negative_press")).toMatchObject({ severity: "notice", title: "부정 보도 — 자본잠식 우려", trust: "needs_review" });
  });

  it("ignores articles the model says are not about the company", () => {
    const events = extractAnalysisEvents({ companyId: 1, runId: 9, trust: "verified", result: result([analysis({ link: "https://n/1", about: false, award: "대상", score: 9 })]) });

    expect(events).toEqual([]);
  });

  it("can emit several kinds from one article, each with its own key space", () => {
    const events = extractAnalysisEvents({ companyId: 1, runId: 9, trust: "verified", result: result([analysis({ link: "https://n/1", award: "대상", score: 8 })]) });

    expect(events.map((e) => e.kind).sort()).toEqual(["award", "positive_press"]);
  });
});

describe("extractPensionEvents", () => {
  const point = (ym: string, subscribers: number | null) => ({ ym, subscribers, noticeAmount: null, hired: null, departed: null });

  it("flags a month-over-month drop of 20 percent or more", () => {
    const events = extractPensionEvents({ companyId: 1, points: [point("202606", 63), point("202607", 41)] });

    expect(events).toEqual([expect.objectContaining({ kind: "headcount_down", severity: "notice", title: "인원 63 → 41명 (−35%)", evidenceKey: "202607", trust: null, occurredAt: new Date("2026-07-31T00:00:00.000Z") })]);
    expect(events[0].evidence[0]).toEqual({ label: "63 → 41명", ym: ["202606", "202607"] });
  });

  it("flags a 12-month rise even when the last step is small", () => {
    const ym = ["202508", "202509", "202510", "202511", "202512", "202601", "202602", "202603", "202604", "202605", "202606", "202607", "202608"];
    const points = ym.map((m, i) => point(m, i === 12 ? 130 : 100));
    const events = extractPensionEvents({ companyId: 1, points });

    expect(events.map((e) => e.kind)).toEqual(["headcount_up"]);
  });

  it("stays quiet under the ratio and skips null months", () => {
    expect(extractPensionEvents({ companyId: 1, points: [point("202606", 100), point("202607", Math.round(100 * (1 - HEADCOUNT_RATIO)) + 1)] })).toEqual([]);
    expect(extractPensionEvents({ companyId: 1, points: [point("202606", null), point("202607", 41)] })).toEqual([]);
  });
});

describe("extractSourceEvents", () => {
  const snap = (source: StoredSnapshot["source"], status: StoredSnapshot["status"], summary: string, payload: unknown = {}): StoredSnapshot => ({ source, status, summary, payload, fetchedAt: new Date("2026-08-29T11:20:00.000Z") });

  it("raises an alert when the tax office says the business closed", () => {
    const events = extractSourceEvents({ companyId: 1, now: NOW, snapshots: [snap("nts", "found", "폐업 · 2026-07-01")] });

    expect(events).toEqual([expect.objectContaining({ kind: "closure", severity: "alert", title: "휴·폐업 — 폐업 · 2026-07-01", evidenceKey: "nts:폐업", occurredAt: new Date("2026-08-29T11:20:00.000Z") })]);
  });

  it("dates the closure event by the tax office closure date, not the fetch time", () => {
    const events = extractSourceEvents({ companyId: 1, now: NOW, snapshots: [snap("nts", "found", "폐업 · 20260710", { closedAt: "20260710" })] });

    expect(events).toEqual([expect.objectContaining({ kind: "closure", severity: "alert", occurredAt: new Date("2026-07-10T00:00:00.000Z") })]);
  });

  it("falls back to the fetch time when the closure payload has no usable date", () => {
    const events = extractSourceEvents({ companyId: 1, now: NOW, snapshots: [snap("nts", "found", "폐업 · 일자 미상", { closedAt: "미상" })] });

    expect(events[0].occurredAt).toEqual(new Date("2026-08-29T11:20:00.000Z"));
  });

  it("notices a venture certificate expiring within 60 days or already expired", () => {
    const soon = extractSourceEvents({ companyId: 1, now: NOW, snapshots: [snap("venture", "found", "벤처투자유형 · 2026-10-01 까지", { validUntil: "2026-10-01" })] });
    const far = extractSourceEvents({ companyId: 1, now: NOW, snapshots: [snap("venture", "found", "벤처투자유형 · 2027-03-01 까지", { validUntil: "2027-03-01" })] });

    expect(soon.map((e) => e.kind)).toEqual(["venture_expiry"]);
    expect(soon[0]).toMatchObject({ severity: "notice", evidenceKey: "venture:2026-10-01", title: "벤처확인 만료 임박 — 2026-10-01 까지" });
    expect(far).toEqual([]);
  });

  it("raises an alert when the pension registry says the workplace withdrew", () => {
    const events = extractSourceEvents({ companyId: 1, now: NOW, snapshots: [snap("nps", "found", "가입자 12명 · 625870", { withdrawnAt: "20260615" })] });

    expect(events).toEqual([expect.objectContaining({ kind: "closure", severity: "alert", title: "연금 사업장 탈퇴 — 20260615", evidenceKey: "nps:탈퇴:20260615", occurredAt: new Date("2026-06-15T00:00:00.000Z") })]);
    expect(events[0].evidence[0]).toEqual({ label: "연금 사업장 탈퇴 20260615", source: "nps" });
  });

  it("stays quiet on a pension snapshot without a withdrawal date", () => {
    const events = extractSourceEvents({ companyId: 1, now: NOW, snapshots: [snap("nps", "found", "가입자 12명 · 625870", { subscribers: 12 })] });

    expect(events).toEqual([]);
  });

  it("notices a same-name conflict on source stages only", () => {
    const events = extractSourceEvents({ companyId: 1, now: NOW, snapshots: [snap("dart", "conflict", "이름이 정확히 맞는 기업이 없다 · 후보 1건"), snap("nts", "found", "계속사업자 · 일반과세자")] });

    expect(events).toEqual([expect.objectContaining({ kind: "source_conflict", severity: "notice", evidenceKey: "dart:conflict", title: "동명 타사 충돌 — DART" })]);
  });
});

describe("dashboardEvents", () => {
  const stub = (kind: EventKind, status: string) =>
    ({ kind, status }) as unknown as Parameters<typeof dashboardEvents>[0][number];

  it("hides auto-resolved namesake conflicts but keeps live ones and every other kind", () => {
    const rows = dashboardEvents([
      stub("source_conflict", "done"),
      stub("source_conflict", "open"),
      stub("award", "done"),
      stub("closure", "open"),
    ]);

    expect(rows.map((row) => [row.kind, row.status])).toEqual([
      ["source_conflict", "open"],
      ["award", "done"],
      ["closure", "open"],
    ]);
  });
});

describe("compareSeverity", () => {
  it("sorts alert before notice before positive before info", () => {
    expect((["info", "positive", "alert", "notice"] as const).slice().sort(compareSeverity)).toEqual(["alert", "notice", "positive", "info"]);
  });
});
