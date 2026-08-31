import { describe, expect, it } from "vitest";
import { buildScoreHeatmap, LIVE_PERIOD, rampFor } from "@/lib/services/scoreHeatmap";

function record(companyId: number, name: string, period: string, total: number, rank: number) {
  return { companyId, companyName: name, period, total, rank, grade: rank <= 10 ? "우수" : "선정" };
}

describe("buildScoreHeatmap", () => {
  it("lays confirmed periods in end-month order and appends the live column", () => {
    const { periods, rows } = buildScoreHeatmap(
      [record(1, "가", "2025-H2", 0.5, 3), record(1, "가", "2025-H1", 0.4, 8), record(2, "나", "2025-H2", 0.6, 1)],
      [
        { companyId: 1, companyName: "가", rank: 2, total: 0.62 },
        { companyId: 2, companyName: "나", rank: 5, total: 0.55 },
      ],
    );

    expect(periods).toEqual(["2025-H1", "2025-H2", LIVE_PERIOD]);
    expect(rows.map((row) => row.companyName)).toEqual(["가", "나"]);
    expect(rows[0].cells[0]).toMatchObject({ period: "2025-H1", total: 0.4, rank: 8 });
    expect(rows[0].cells[2]).toMatchObject({ period: LIVE_PERIOD, total: 0.62, rank: 2, grade: "우수" });
    expect(rows[1].cells[0]).toBeNull();
  });

  it("keeps a confirmed-only company and sorts rows by their latest total", () => {
    const { rows } = buildScoreHeatmap(
      [record(1, "가", "2025", 0.3, 20), record(2, "나", "2025", 0.7, 1)],
      [{ companyId: 2, companyName: "나", rank: 1, total: 0.71 }],
    );

    expect(rows.map((row) => row.companyName)).toEqual(["나", "가"]);
    expect(rows[1].cells[1]).toBeNull();
  });

  it("works without a live column", () => {
    const { periods } = buildScoreHeatmap([record(1, "가", "2025", 0.5, 2)], null);

    expect(periods).toEqual(["2025"]);
  });
});

describe("rampFor", () => {
  it("maps totals to a single-hue ramp, darker as the score grows", () => {
    expect(rampFor(0.25)).toBe("#eaf1ff");
    expect(rampFor(0.45)).toBe("#a9c4ff");
    expect(rampFor(0.65)).toBe("#2b6bff");
  });
});
