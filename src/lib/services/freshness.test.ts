import { describe, expect, it } from "vitest";
import { buildRibbonGroups, nextPensionDate } from "@/lib/services/freshness";

const NOW = new Date("2026-08-30T03:00:00.000Z");

describe("nextPensionDate", () => {
  it("points at the 15th of the month after the latest snapshot when that is still ahead", () => {
    expect(nextPensionDate("202607", new Date("2026-08-01T00:00:00Z"))).toBe("08-15");
    expect(nextPensionDate("202612", new Date("2027-01-02T00:00:00Z"))).toBe("01-15");
  });

  it("never points into the past — it rolls forward to the next 15th", () => {
    expect(nextPensionDate("202607", NOW)).toBe("09-15");
    expect(nextPensionDate("202601", NOW)).toBe("09-15");
  });

  it("gives a dash when no snapshot exists", () => {
    expect(nextPensionDate(undefined, NOW)).toBe("—");
  });
});

describe("buildRibbonGroups", () => {
  const base = {
    now: NOW,
    latestNewsAt: "2026-08-30T03:31:00.000Z",
    fullSourceRefreshAt: "2026-08-28T13:19:00.000Z",
    pensionYm: "202607",
    reviewCompanies: 12,
    openAlertNotice: 16,
    needsReview: 7,
    year: 2025,
  };

  it("leads with three reference dates carrying their age", () => {
    const [dates] = buildRibbonGroups(base);
    expect(dates.label).toBe("기준일");
    expect(dates.items.map((i) => i.text)).toEqual(["뉴스 08-30 (오늘)", "원천 08-28 (2일 전)", "연금 2026-07 · 다음 적재 09-15"]);
    expect(dates.items.every((i) => !i.stale)).toBe(true);
  });

  it("marks a reference older than 30 days as stale instead of colouring it", () => {
    const [dates] = buildRibbonGroups({ ...base, fullSourceRefreshAt: "2026-07-01T00:00:00.000Z" });
    expect(dates.items[1]).toMatchObject({ text: "원천 07-01 (60일 전) · 낡음", stale: true });
  });

  it("ends with three things to do, each a link", () => {
    const [, todo] = buildRibbonGroups(base);
    expect(todo.label).toBe("할 일");
    expect(todo.items).toEqual([
      { text: "확인 필요 12개사", href: "/companies?year=2025&review=1" },
      { text: "미확인 경보·주의 16", href: "/dashboard?year=2025#events" },
      { text: "검토 필요 7", href: "/ranking?year=2025" },
    ]);
  });

  it("keeps zero counts visible and dashes out dates that never happened", () => {
    const [dates, todo] = buildRibbonGroups({ ...base, latestNewsAt: null, fullSourceRefreshAt: null, reviewCompanies: 0, openAlertNotice: 0, needsReview: 0 });
    expect(dates.items[0].text).toBe("뉴스 —");
    expect(dates.items[1].text).toBe("원천 —");
    expect(todo.items.map((i) => i.text)).toEqual(["확인 필요 0개사", "미확인 경보·주의 0", "검토 필요 0"]);
  });
});
