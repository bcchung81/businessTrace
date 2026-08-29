import { describe, expect, it } from "vitest";
import { buildFreshnessItems, nextPensionDate } from "@/lib/services/freshness";

const NOW = new Date("2026-08-29T03:00:00.000Z");

describe("nextPensionDate", () => {
  it("points at the 15th of the month after the latest snapshot", () => {
    expect(nextPensionDate("202607")).toBe("08-15");
    expect(nextPensionDate("202612")).toBe("01-15");
  });

  it("gives a dash when no snapshot exists", () => {
    expect(nextPensionDate(undefined)).toBe("—");
  });
});

describe("buildFreshnessItems", () => {
  const base = {
    now: NOW,
    latestNewsAt: "2026-08-29T00:12:00.000Z",
    latestSourceAt: "2026-08-28T13:19:00.000Z",
    sourcesUpdatedToday: 50,
    sourcesTotal: 50,
    pensionYm: "202607",
    running: 0,
    todo: 4,
    stale: 30,
  };

  it("leads with collection freshness in KST", () => {
    const items = buildFreshnessItems(base);

    expect(items[0]).toBe("뉴스 08-29 09:12");
    expect(items[1]).toBe("원천 08-28 22:19 · 50/50");
    expect(items[2]).toBe("연금 2026-07 · 다음 08-15");
  });

  it("shows running analyses only while something is running", () => {
    expect(buildFreshnessItems(base)).not.toContain("실행 중 0");
    expect(buildFreshnessItems({ ...base, running: 3 })).toContain("실행 중 3");
  });

  it("ends with today's todo and stale counts", () => {
    const items = buildFreshnessItems(base);

    expect(items.at(-2)).toBe("조치 4");
    expect(items.at(-1)).toBe("낡은 근거 30");
  });

  it("dashes out collection times that never happened", () => {
    const items = buildFreshnessItems({ ...base, latestNewsAt: null, latestSourceAt: null, sourcesUpdatedToday: 0 });

    expect(items[0]).toBe("뉴스 —");
    expect(items[1]).toBe("원천 — · 0/50");
  });
});
