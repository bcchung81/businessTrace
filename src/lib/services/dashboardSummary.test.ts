import { describe, it, expect } from "vitest";
import { buildDashboard, type CompanySeries } from "@/lib/services/dashboardSummary";

function series(name: string, subscribers: Array<number | null>, notice = 27000180): CompanySeries {
  const months = ["202602", "202603", "202604", "202605", "202606", "202607"];
  return {
    companyId: name.length,
    name,
    points: subscribers.map((value, index) => ({
      ym: months[index],
      subscribers: value,
      noticeAmount: index === subscribers.length - 1 ? notice : null,
      hired: null,
      departed: null,
    })),
  };
}

describe("buildDashboard", () => {
  it("collects every month across companies onto one axis", () => {
    const summary = buildDashboard([
      series("크립토랩", [52, 52, 52, 52, 54, 61]),
      series("올림플래닛", [37, 36, 33, 32, 34, 32]),
    ]);

    expect(summary.months).toEqual(["202602", "202603", "202604", "202605", "202606", "202607"]);
  });

  it("gives each company its own facet with the latest value and change", () => {
    const summary = buildDashboard([series("크립토랩", [52, 52, 52, 52, 54, 61])]);

    expect(summary.facets[0]).toMatchObject({
      name: "크립토랩",
      latest: 61,
      from: 52,
      delta: 9,
      direction: "up",
    });
    expect(summary.facets[0].points).toHaveLength(6);
  });

  it("ranks the steepest decline first because that is the review trigger", () => {
    const summary = buildDashboard([
      series("크립토랩", [52, 52, 52, 52, 54, 61]),
      series("올림플래닛", [68, 60, 43, 39, 34, 32]),
      series("옥타코", [27, 24, 22, 16, 13, 13]),
    ]);

    expect(summary.ranking.map((entry) => entry.name)).toEqual(["올림플래닛", "옥타코", "크립토랩"]);
    expect(summary.ranking[0].ratio).toBeCloseTo(-0.529, 3);
  });

  it("places a company on the scatter by headcount and the income the notice implies", () => {
    const summary = buildDashboard([series("크립토랩", [52, 52, 52, 52, 54, 61], 27000180)]);

    expect(summary.scatter[0]).toMatchObject({
      name: "크립토랩",
      subscribers: 61,
      averageBaseIncome: 4918066,
      annualPayroll: 3600024000,
    });
  });

  it("reports a company with no pension data as uncovered instead of dropping it silently", () => {
    const summary = buildDashboard([
      series("크립토랩", [52, 52, 52, 52, 54, 61]),
      { companyId: 9, name: "넷록스", points: [] },
    ]);

    expect(summary.uncovered).toEqual(["넷록스"]);
    expect(summary.facets.map((facet) => facet.name)).toEqual(["크립토랩"]);
    expect(summary.covered).toBe(1);
    expect(summary.total).toBe(2);
  });

  it("leaves a single month without a change rather than calling it flat", () => {
    const summary = buildDashboard([series("페어리", [8])]);

    expect(summary.facets[0].direction).toBe("unknown");
    expect(summary.facets[0].delta).toBeNull();
    expect(summary.ranking).toHaveLength(0);
  });

  it("keeps a missing month null so the line breaks instead of dipping to zero", () => {
    const summary = buildDashboard([series("논스랩", [11, null, 11, 10, 8, 7])]);

    expect(summary.facets[0].points[1].subscribers).toBeNull();
    expect(summary.facets[0].latest).toBe(7);
  });

  it("omits the scatter point when the notice amount is missing", () => {
    const summary = buildDashboard([
      { companyId: 1, name: "넷록스", points: [{ ym: "202607", subscribers: 4, noticeAmount: null, hired: null, departed: null }] },
    ]);

    expect(summary.scatter).toHaveLength(0);
  });

  it("surfaces the five steepest declines and the five strongest gains", () => {
    const shrink = (name: string, to: number) => series(name, [100, to]);
    const summary = buildDashboard([
      shrink("a", 10),
      shrink("b", 20),
      shrink("c", 30),
      shrink("d", 40),
      shrink("e", 50),
      shrink("f", 60),
      shrink("g", 200),
    ]);

    expect(summary.movers.declining.map((entry) => entry.name)).toEqual(["a", "b", "c", "d", "e"]);
    expect(summary.movers.growing.map((entry) => entry.name)).toEqual(["g"]);
  });

  it("leaves the mover lists short rather than padding them", () => {
    const summary = buildDashboard([series("하나", [10, 12])]);

    expect(summary.movers.declining).toEqual([]);
    expect(summary.movers.growing).toHaveLength(1);
  });

  it("carries each ranked company's own series so the row can draw its trend", () => {
    const summary = buildDashboard([series("올림플래닛", [68, 60, 43, 39, 34, 32])]);

    expect(summary.ranking[0].points.map((point) => point.subscribers)).toEqual([
      68, 60, 43, 39, 34, 32,
    ]);
  });
});
