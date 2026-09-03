import { describe, expect, it, test } from "vitest";
import type { EventRow } from "@/lib/repositories/eventRepository";
import { buildCompanyCards, filterCards, matchesQuery, sortCards, type CompanyCardData } from "@/lib/services/companyCards";

const card = (id: number, name: string, needsReview: boolean): CompanyCardData => ({
  everHadEvents: false,
  id, name, industry: null, businessNo: "1", headcount: { latest: null, delta12m: null }, latestArticle: null,
  events30d: { alert: 0, notice: 0, positive: 0, info: 0 }, open: 0, worstSeverity: null, trust: null, needsReview,
});

const COMPANIES = [
  { id: 1, name: "딥노이드", industry: "의료AI", businessNo: "1" },
  { id: 2, name: "알체라", industry: null, businessNo: null },
  { id: 3, name: "가", industry: null, businessNo: "3" },
];
function ev(companyId: number, severity: EventRow["severity"], status: EventRow["status"] = "open"): EventRow {
  return { id: Math.random(), companyId, companyName: "", kind: "award", severity, occurredAt: "2026-08-20T00:00:00.000Z", title: "", evidence: [], runId: null, trust: null, status, note: null, reviewedAt: null };
}
const point = (ym: string, subscribers: number) => ({ ym, subscribers, noticeAmount: null, hired: null, departed: null });

describe("buildCompanyCards", () => {
  it("aggregates events, headcount, latest article and trust per company", () => {
    const cards = buildCompanyCards({
      companies: COMPANIES,
      events: [ev(1, "positive"), ev(1, "positive", "done"), ev(2, "notice"), ev(2, "alert")],
      series: [{ companyId: 1, name: "딥노이드", points: [point("202507", 80), point("202607", 89)] }],
      news: [{ companyId: 1, name: "딥노이드", articles: 3, latest: "2026-08-26T00:00:00.000Z" }],
      verdicts: [{ companyId: 1, verdict: "verified" }],
    });
    const deep = cards.find((c) => c.id === 1)!;
    const al = cards.find((c) => c.id === 2)!;

    expect(deep).toMatchObject({ headcount: { latest: 89, delta12m: 0.11 }, latestArticle: "2026-08-26T00:00:00.000Z", events30d: { alert: 0, notice: 0, positive: 2, info: 0 }, open: 0, worstSeverity: "positive", trust: "verified" });
    expect(al).toMatchObject({ headcount: { latest: null, delta12m: null }, worstSeverity: "alert", open: 2, trust: null });
    expect(cards.find((c) => c.id === 3)!.worstSeverity).toBeNull();
  });
});

describe("sortCards / filterCards", () => {
  const cards = buildCompanyCards({ companies: COMPANIES, events: [ev(2, "alert"), ev(1, "positive"), ev(1, "positive")], series: [], news: [{ companyId: 3, name: "가", articles: 1, latest: "2026-08-29T00:00:00.000Z" }], verdicts: [] });

  it("triage puts alert first, then more open events, then name", () => {
    expect(sortCards(cards, "triage").map((c) => c.name)).toEqual(["알체라", "딥노이드", "가"]);
  });

  it("news sorts by latest article, none last", () => {
    expect(sortCards(cards, "news").map((c) => c.name)[0]).toBe("가");
  });

  it("filters notice-only, positive-only and missing business number", () => {
    expect(filterCards(cards, { noticeOnly: true }).map((c) => c.name)).toEqual(["알체라"]);
    expect(filterCards(cards, { positiveOnly: true }).map((c) => c.name)).toEqual(["딥노이드"]);
    expect(filterCards(cards, { missingBusinessNo: true }).map((c) => c.name)).toEqual(["알체라"]);
  });

  it("remembers whether a company ever had an event, from the all-time list", () => {
    const built = buildCompanyCards({ companies: [{ id: 9, name: "㈜조용", industry: null, businessNo: "1" }], events: [], series: [], news: [], verdicts: [], everEventIds: [9] });
    expect(built[0].everHadEvents).toBe(true);
    expect(buildCompanyCards({ companies: [{ id: 9, name: "㈜조용", industry: null, businessNo: "1" }], events: [], series: [], news: [], verdicts: [] })[0].everHadEvents).toBe(false);
  });

  it("filters review-only from the ids a person must settle", () => {
    const flagged = cards.map((c) => ({ ...c, needsReview: c.name === "딥노이드" }));
    expect(filterCards(flagged, { reviewOnly: true }).map((c) => c.name)).toEqual(["딥노이드"]);
  });
});

test("matchesQuery ignores spaces and case", () => {
  expect(matchesQuery("㈜ 크립토 랩", "크립토랩")).toBe(true);
  expect(matchesQuery("Netlocks", "netlocks")).toBe(true);
  expect(matchesQuery("넷록스", "옥타코")).toBe(false);
  expect(matchesQuery("넷록스", "  ")).toBe(true);
});

test("filterCards narrows by query together with the flags", () => {
  const cards = [card(1, "크립토랩", false), card(2, "넷록스", true)];
  expect(filterCards(cards, { query: "넷" }).map((c) => c.id)).toEqual([2]);
  expect(filterCards(cards, { query: "넷", reviewOnly: true }).map((c) => c.id)).toEqual([2]);
  expect(filterCards(cards, { query: "크립", reviewOnly: true })).toEqual([]);
});

describe("the 미확인 column", () => {
  const row = (over: Partial<EventRow>): EventRow => ({
    id: Math.random(), companyId: 1, companyName: "가", kind: "award", severity: "positive",
    occurredAt: "2026-08-20T00:00:00.000Z", title: "t", evidence: [], runId: null, trust: null,
    status: "open", note: null, reviewedAt: null, ...over,
  });

  function cardFor(events: EventRow[]) {
    return buildCompanyCards({
      companies: [{ id: 1, name: "가", industry: null, businessNo: null }],
      events, series: [], news: [], verdicts: [],
    })[0];
  }

  it("counts only unacknowledged alerts and notices", () => {
    expect(cardFor([row({ severity: "alert" }), row({ severity: "notice" })]).open).toBe(2);
  });

  it("can reach zero for a company whose only events are awards — the header promises 경보·주의", () => {
    expect(cardFor([row({ severity: "positive" }), row({ severity: "positive" }), row({ severity: "info" })]).open).toBe(0);
  });

  it("drops an acknowledged alert", () => {
    expect(cardFor([row({ severity: "alert", status: "acknowledged" })]).open).toBe(0);
  });

  it("drops a name-clash event that bulk confirm never touches", () => {
    expect(cardFor([row({ severity: "alert", kind: "source_conflict" })]).open).toBe(0);
  });
});
