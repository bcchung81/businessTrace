import { describe, expect, it } from "vitest";
import { growthRate, headcountGrowth, hiringBalance, procurementGrowth } from "@/lib/services/growthSignals";

describe("growthRate", () => {
  it("gives the year-on-year ratio", () => {
    expect(growthRate(140, 100)).toBe(0.4);
    expect(growthRate(60, 100)).toBe(-0.4);
  });

  it("rounds to two places so the number reads like a percentage", () => {
    expect(growthRate(1234, 1000)).toBe(0.23);
  });

  it.each([
    ["현재값 없음", null, 100],
    ["전년값 없음", 140, null],
    ["전년값 미제공", 140, undefined],
    ["전년 0 — 나눌 수 없다", 140, 0],
    ["전년 적자 — 비율의 뜻이 뒤집힌다", 140, -50],
  ])("%s 이면 결측이다", (_label, current, previous) => {
    expect(growthRate(current, previous)).toBeNull();
  });
});

describe("headcountGrowth", () => {
  const point = (ym: string, subscribers: number | null) => ({ ym, subscribers, noticeAmount: null, hired: null, departed: null });

  it("compares the latest month with the same month a year earlier", () => {
    expect(headcountGrowth([point("202508", 50), point("202608", 65)])).toBe(0.3);
  });

  it("ignores months in between", () => {
    expect(headcountGrowth([point("202508", 50), point("202602", 100), point("202608", 65)])).toBe(0.3);
  });

  it("annualises the available span when a full year back is not on record", () => {
    // 국민연금은 12개월치만 유지한다 — 매달 쌓기 시작한 초기에는 13개월 창이 없다.
    // 11개월에 +10% 면 연 환산 약 +10.9%.
    expect(headcountGrowth([point("202508", 100), point("202607", 110)])).toBe(0.11);
  });

  it("prefers the exact twelve-month pair over annualising when both are possible", () => {
    const points = [point("202508", 100), point("202510", 200), point("202608", 130)];
    expect(headcountGrowth(points)).toBe(0.3);
  });

  it("refuses to annualise a span too short to mean anything", () => {
    expect(headcountGrowth([point("202604", 60), point("202608", 65)])).toBeNull();
  });

  it("skips months whose subscriber count was never measured", () => {
    expect(headcountGrowth([point("202508", null), point("202608", 65)])).toBeNull();
  });

  it("is missing for an empty series", () => {
    expect(headcountGrowth([])).toBeNull();
  });
});

describe("procurementGrowth", () => {
  const now = new Date("2026-09-04T00:00:00Z");
  const y = (year: number, total: number) => ({ year, count: 1, total });

  it("compares the last two years against the two before them", () => {
    // 최근 2년(2025·2026) 300 vs 직전 2년(2023·2024) 200 → +50%
    expect(procurementGrowth([y(2026, 100), y(2025, 200), y(2024, 150), y(2023, 50)], now)).toBe(0.5);
  });

  it("treats a year with no award as 0 inside a window it already participated in", () => {
    expect(procurementGrowth([y(2026, 150), y(2024, 100), y(2023, 100)], now)).toBe(-0.25);
  });

  it("is missing — not infinite — when the earlier window has nothing", () => {
    expect(procurementGrowth([y(2026, 100), y(2025, 50)], now)).toBeNull();
  });

  it("is missing when the company never appears in procurement at all", () => {
    expect(procurementGrowth([], now)).toBeNull();
  });

  it("ignores years outside the four-year window", () => {
    expect(procurementGrowth([y(2019, 900), y(2026, 100), y(2024, 100)], now)).toBe(0);
  });
});

describe("hiringBalance", () => {
  const m = (ym: string, subscribers: number | null, hired: number | null, departed: number | null) =>
    ({ ym, subscribers, noticeAmount: null, hired, departed });
  const year = (hired: number, departed: number, subscribers = 100) =>
    Array.from({ length: 12 }, (_, i) => m(`2026${String(i + 1).padStart(2, "0")}`, subscribers, hired, departed));

  it("gives net hires over the year as a share of headcount", () => {
    // 월 3명 입사 · 1명 퇴사 × 12개월 = +24 / 100명 → +24%
    expect(hiringBalance(year(3, 1))).toBe(0.24);
  });

  it("is negative when more leave than join", () => {
    expect(hiringBalance(year(1, 3))).toBe(-0.24);
  });

  it("annualises when fewer than twelve months are on record", () => {
    // 6개월 +12 → 연 환산 +24 / 100
    expect(hiringBalance(year(3, 1).slice(0, 6))).toBe(0.24);
  });

  it("only counts months where both hires and departures were reported", () => {
    const points = [...year(3, 1).slice(0, 6), m("202607", 100, 5, null), m("202608", 100, null, 5)];
    expect(hiringBalance(points)).toBe(0.24);
  });

  it("refuses a span too short to mean anything", () => {
    expect(hiringBalance(year(3, 1).slice(0, 5))).toBeNull();
  });

  it("is missing when headcount is unknown — a ratio needs a denominator", () => {
    expect(hiringBalance(year(3, 1, null as never))).toBeNull();
  });
});
