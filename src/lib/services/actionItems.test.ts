import { describe, expect, it } from "vitest";
import type { CompanyPipelineRow } from "@/lib/repositories/companyPipeline";
import type { RankEntry } from "@/lib/services/dashboardSummary";
import { buildActionItems } from "@/lib/services/actionItems";
import type { NewsCoverage } from "@/lib/services/newsCoverage";

const NOW = new Date("2026-08-29T00:00:00.000Z");
const COMPANIES = [
  { id: 1, name: "크립토랩", businessNo: "1198701587" },
  { id: 2, name: "옥타코", businessNo: "1058744210" },
  { id: 3, name: "아크릴", businessNo: null },
];

function pipeline(id: number, conflicts: string[] = []): CompanyPipelineRow {
  return {
    id,
    name: COMPANIES.find((c) => c.id === id)?.name ?? "",
    businessNo: null,
    cells: Object.fromEntries(conflicts.map((stage) => [stage, { state: "conflict", value: "", note: "" }])),
  };
}

function news(latestById: Record<number, string | null>): NewsCoverage {
  return {
    byCompany: COMPANIES.map((c) => ({ companyId: c.id, name: c.name, articles: latestById[c.id] ? 1 : 0, latest: latestById[c.id] ?? null })),
    recent14: 0,
    total: 0,
  };
}

function rank(id: number, ratio: number): RankEntry {
  const name = COMPANIES.find((c) => c.id === id)?.name ?? "";
  return { companyId: id, name, from: 100, latest: Math.round(100 * (1 + ratio)), delta: Math.round(100 * ratio), ratio, points: [] };
}

describe("buildActionItems", () => {
  it("always returns the four items in a fixed order, even at zero", () => {
    const items = buildActionItems({ companies: [], pipeline: [], news: { byCompany: [], recent14: 0, total: 0 }, declining: [], now: NOW });

    expect(items.map((item) => item.key)).toEqual(["businessNo", "conflict", "stale", "decline"]);
    expect(items.every((item) => item.count === 0)).toBe(true);
  });

  it("lists companies without a business number", () => {
    const items = buildActionItems({ companies: COMPANIES, pipeline: [], news: news({}), declining: [], now: NOW });
    const item = items.find((entry) => entry.key === "businessNo");

    expect(item?.count).toBe(1);
    expect(item?.companies).toEqual([{ id: 3, name: "아크릴" }]);
    expect(item?.remedy).toBe("금융위 폴백도 실패 — 수기 입력 필요");
  });

  it("names the conflicting stage in the remedy", () => {
    const items = buildActionItems({ companies: COMPANIES, pipeline: [pipeline(2, ["dart"])], news: news({}), declining: [], now: NOW });
    const item = items.find((entry) => entry.key === "conflict");

    expect(item?.companies).toEqual([{ id: 2, name: "옥타코", detail: "DART" }]);
    expect(item?.remedy).toBe("DART 가 다른 기업을 물어옴 — 두 원천 교차 일치로 확정");
  });

  it("does not count a needs_review verify cell as a conflict", () => {
    const items = buildActionItems({
      companies: COMPANIES,
      pipeline: [{ id: 2, name: "옥타코", businessNo: null, cells: { verify: { state: "conflict", value: "검토 필요", note: "" } } }],
      news: news({}),
      declining: [],
      now: NOW,
    });
    const item = items.find((entry) => entry.key === "conflict");

    expect(item?.count).toBe(0);
  });

  it("starts the remedy with a generic source name when there are no conflicts", () => {
    const items = buildActionItems({ companies: COMPANIES, pipeline: [], news: news({}), declining: [], now: NOW });
    const item = items.find((entry) => entry.key === "conflict");

    expect(item?.remedy.startsWith("원천 가")).toBe(true);
  });

  it("names each conflicting stage once when one company hits two at once", () => {
    const items = buildActionItems({
      companies: COMPANIES,
      pipeline: [pipeline(2, ["dart", "nps"])],
      news: news({}),
      declining: [],
      now: NOW,
    });
    const item = items.find((entry) => entry.key === "conflict");

    expect(item?.companies).toEqual([{ id: 2, name: "옥타코", detail: "DART·연금" }]);
    expect(item?.remedy).toBe("DART·연금 가 다른 기업을 물어옴 — 두 원천 교차 일치로 확정");
  });

  it("flags companies whose newest article is older than 30 days or missing", () => {
    const items = buildActionItems({
      companies: COMPANIES,
      pipeline: [],
      news: news({ 1: "2026-08-26T00:00:00.000Z", 2: "2026-07-01T00:00:00.000Z", 3: null }),
      declining: [],
      now: NOW,
    });
    const item = items.find((entry) => entry.key === "stale");

    expect(item?.companies.map((c) => c.name)).toEqual(["옥타코", "아크릴"]);
  });

  it("keeps only declines of 20 percent or more and prints the ratio", () => {
    const items = buildActionItems({
      companies: COMPANIES,
      pipeline: [],
      news: news({}),
      declining: [rank(1, -0.31), rank(2, -0.1)],
      now: NOW,
    });
    const item = items.find((entry) => entry.key === "decline");

    expect(item?.companies).toEqual([{ id: 1, name: "크립토랩", detail: "▼31%" }]);
  });
});
