import { describe, expect, it } from "vitest";
import { financeRatios } from "@/lib/services/financeRatios";

const base = { revenue: 1000, operatingIncome: 200, netIncome: 150, totalAssets: 5000, totalLiabilities: 2000, totalEquity: 3000 };

describe("financeRatios", () => {
  it("computes debt ratio, ROE and operating margin from the totals", () => {
    expect(financeRatios(base)).toMatchObject({
      debtRatio: { value: 2000 / 3000 },
      roe: { value: 150 / 3000 },
      operatingMargin: { value: 200 / 1000 },
    });
  });

  it("calls negative equity 자본잠식 rather than printing a number that flips sign", () => {
    const ratios = financeRatios({ ...base, totalEquity: -500, netIncome: -900 });

    expect(ratios.debtRatio).toEqual({ value: null, note: "자본잠식" });
    expect(ratios.roe).toEqual({ value: null, note: "자본잠식" });
  });

  it("says there is no revenue instead of dividing by zero", () => {
    expect(financeRatios({ ...base, revenue: 0 })).toMatchObject({ operatingMargin: { value: null, note: "매출 없음" } });
  });

  it("leaves a ratio empty when a figure it needs is missing", () => {
    const ratios = financeRatios({ ...base, totalEquity: null, revenue: null });

    expect(ratios.debtRatio).toEqual({ value: null, note: null });
    expect(ratios.roe).toEqual({ value: null, note: null });
    expect(ratios.operatingMargin).toEqual({ value: null, note: null });
  });
});
