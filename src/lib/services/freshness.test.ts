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
    reviewItems: [
      { id: 5, name: "㈜가", reasons: ["사업자번호 미확보", "동명 충돌 1"] },
      { id: 9, name: "㈜나", reasons: ["검토 필요"] },
    ],
    needsReviewItems: [{ id: 9, name: "㈜나", reasons: ["검토 필요"] }],
    openEvents: [{ id: 11, companyId: 7, companyName: "㈜다", title: "폐업 위험", severity: "alert" as const }],
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

  it("ends with three things to do, each unfolding the list it stands for", () => {
    const [, todo] = buildRibbonGroups(base);
    expect(todo.label).toBe("할 일");
    expect(todo.items).toEqual([
      {
        text: "확인 필요 12개사",
        menu: [
          { href: "/companies/5?queue=review", label: "㈜가", note: "사업자번호 미확보 · 동명 충돌 1" },
          { href: "/companies/9?queue=review", label: "㈜나", note: "검토 필요" },
        ],
      },
      { text: "미확인 경보·주의 16", menu: [{ href: "/companies/7?queue=review", label: "㈜다", note: "경보 · 폐업 위험" }] },
      { text: "검토 필요 7", menu: [{ href: "/companies/9?queue=verification", label: "㈜나", note: "검증 검토" }] },
    ]);
  });

  it("calls a notice a notice in the event menu", () => {
    const [, todo] = buildRibbonGroups({ ...base, openEvents: [{ id: 12, companyId: 8, companyName: "㈜라", title: "부정 보도", severity: "notice" as const }] });
    expect(todo.items[1].menu).toEqual([{ href: "/companies/8?queue=review", label: "㈜라", note: "주의 · 부정 보도" }]);
  });

  it("keeps zero counts visible and dashes out dates that never happened", () => {
    const [dates, todo] = buildRibbonGroups({ ...base, latestNewsAt: null, fullSourceRefreshAt: null, reviewCompanies: 0, openAlertNotice: 0, needsReview: 0, reviewItems: [], needsReviewItems: [], openEvents: [] });
    expect(dates.items[0].text).toBe("뉴스 —");
    expect(dates.items[1].text).toBe("원천 —");
    expect(todo.items.map((i) => i.text)).toEqual(["확인 필요 0개사", "미확인 경보·주의 0", "검토 필요 0"]);
    expect(todo.items.every((i) => i.href === undefined && i.menu === undefined)).toBe(true);
  });
});
