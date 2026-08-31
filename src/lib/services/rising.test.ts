import { describe, expect, it } from "vitest";
import { compareRanks, fallingRanks, risingCompanies } from "@/lib/services/rising";

describe("fallingRanks", () => {
  it("ranks live standings that dropped against the confirmed baseline", () => {
    const live = [
      { companyId: 1, companyName: "급락기업", rank: 20, total: 0.31 },
      { companyId: 2, companyName: "소폭하락", rank: 8, total: 0.5 },
      { companyId: 3, companyName: "상승기업", rank: 2, total: 0.7 },
    ];
    const baseline = [
      { companyId: 1, rank: 3 },
      { companyId: 2, rank: 5 },
      { companyId: 3, rank: 9 },
    ];

    const falling = fallingRanks(live, baseline, 10);

    expect(falling).toEqual([
      { companyId: 1, companyName: "급락기업", prevRank: 3, rank: 20, delta: 17, total: 0.31, totalDelta: null, reason: null },
      { companyId: 2, companyName: "소폭하락", prevRank: 5, rank: 8, delta: 3, total: 0.5, totalDelta: null, reason: null },
    ]);
  });
});

describe("compareRanks", () => {
  it("ranks live standings against a confirmed baseline", () => {
    const live = [
      { companyId: 1, companyName: "미타운", rank: 4, total: 0.56 },
      { companyId: 2, companyName: "써로마인드", rank: 6, total: 0.54 },
      { companyId: 3, companyName: "하락기업", rank: 9, total: 0.5 },
      { companyId: 4, companyName: "신규기업", rank: 1, total: 0.9 },
      { companyId: 5, companyName: "순위없음", rank: null, total: 0.2 },
    ];
    const baseline = [
      { companyId: 1, rank: 13 },
      { companyId: 2, rank: 13 },
      { companyId: 3, rank: 2 },
      { companyId: 5, rank: 20 },
    ];

    const rising = compareRanks(live, baseline, 10);

    expect(rising).toEqual([
      { companyId: 1, companyName: "미타운", prevRank: 13, rank: 4, delta: 9, total: 0.56, totalDelta: null, reason: null },
      { companyId: 2, companyName: "써로마인드", prevRank: 13, rank: 6, delta: 7, total: 0.54, totalDelta: null, reason: null },
    ]);
  });
});

type Metric = { key: "sentiment" | "award" | "investment" | "finance" | "verification"; raw: number | null; normalised: number | null; weight: number };

function metrics(over: Partial<Record<Metric["key"], number | null>> = {}): Metric[] {
  const base: Record<Metric["key"], number | null> = { sentiment: 0.5, award: 0.5, investment: 0.5, finance: null, verification: 1, ...over };
  const weight: Record<Metric["key"], number> = { sentiment: 0.3, award: 0.2, investment: 0.2, finance: 0.2, verification: 0.1 };
  return (Object.keys(weight) as Metric["key"][]).map((key) => ({ key, raw: base[key], normalised: base[key], weight: weight[key] }));
}

describe("move reasons", () => {
  it("names the metric that drove the climb", () => {
    const live = [{ companyId: 1, companyName: "코머신", rank: 4, total: 0.6875, metrics: metrics({ award: 1 }) }];
    const baseline = [{ companyId: 1, rank: 12, total: 0.4375, metrics: metrics({ award: 0 }) }];

    const [row] = compareRanks(live, baseline, 10);

    expect(row.reason).toMatchObject({ key: "award", label: "수상 상승" });
    expect(row.totalDelta).toBeCloseTo(0.25, 5);
  });

  it("calls a verification flip what it is — a pipeline state change, not performance", () => {
    const live = [{ companyId: 1, companyName: "무암", rank: 20, total: 0.44, metrics: metrics({ verification: 1 }) }];
    const baseline = [{ companyId: 1, rank: 40, total: 0.34, metrics: metrics({ verification: 0 }) }];

    const [row] = compareRanks(live, baseline, 10);

    expect(row.reason).toMatchObject({ key: "verification", label: "검증 상태 변경" });
  });

  it("blames the risk penalty when the metrics alone do not explain the fall", () => {
    const live = [{ companyId: 1, companyName: "리스크사", rank: 30, total: 0.35, metrics: metrics() }];
    const baseline = [{ companyId: 1, rank: 10, total: 0.5, metrics: metrics() }];

    const [row] = fallingRanks(live, baseline, 10);

    expect(row.reason).toMatchObject({ key: "risk", label: "리스크 감점" });
  });

  it("drops a rank move whose score barely changed — the mid-field is compressed", () => {
    const live = [
      { companyId: 1, companyName: "노이즈", rank: 25, total: 0.401, metrics: metrics() },
      { companyId: 2, companyName: "진짜상승", rank: 5, total: 0.55, metrics: metrics({ award: 1 }) },
    ];
    const baseline = [
      { companyId: 1, rank: 29, total: 0.398, metrics: metrics() },
      { companyId: 2, rank: 14, total: 0.45, metrics: metrics({ award: 0 }) },
    ];

    expect(compareRanks(live, baseline, 10).map((row) => row.companyName)).toEqual(["진짜상승"]);
  });
});

function record(companyId: number, name: string, period: string, rank: number | null, total: number) {
  return { companyId, companyName: name, period, rank, total };
}

describe("risingCompanies", () => {
  it("ranks companies by how far they climbed since the previous period", () => {
    const records = [
      record(1, "미타운", "2025-H1", 13, 0.48),
      record(1, "미타운", "2025-H2", 4, 0.56),
      record(2, "써로마인드", "2025-H1", 13, 0.47),
      record(2, "써로마인드", "2025-H2", 6, 0.54),
      record(3, "엘리스그룹", "2025-H1", 1, 0.62),
      record(3, "엘리스그룹", "2025-H2", 1, 0.63),
      record(4, "하락기업", "2025-H1", 2, 0.6),
      record(4, "하락기업", "2025-H2", 9, 0.5),
    ];

    const rising = risingCompanies(records, "2025-H2", 10);

    expect(rising).toEqual([
      { companyId: 1, companyName: "미타운", prevRank: 13, rank: 4, delta: 9, total: 0.56, totalDelta: expect.closeTo(0.08, 5), reason: null },
      { companyId: 2, companyName: "써로마인드", prevRank: 13, rank: 6, delta: 7, total: 0.54, totalDelta: expect.closeTo(0.07, 5), reason: null },
    ]);
  });

  it("caps the list and skips companies without both periods or without ranks", () => {
    const records = [
      ...Array.from({ length: 12 }, (_, index) =>
        [record(index + 1, `기업${index + 1}`, "2025", 20 - index, 0.4), record(index + 1, `기업${index + 1}`, "2026", 19 - index - index, 0.5)]
      ).flat(),
      record(99, "신규기업", "2026", 1, 0.9),
      record(98, "순위없음", "2025", null, 0.2),
      record(98, "순위없음", "2026", null, 0.3),
    ];

    const rising = risingCompanies(records, "2026", 10);

    expect(rising).toHaveLength(10);
    expect(rising.every((row) => row.delta > 0)).toBe(true);
    expect(rising.find((row) => row.companyId === 99)).toBeUndefined();
    expect(rising.find((row) => row.companyId === 98)).toBeUndefined();
  });

  it("is empty when the previous period has no records", () => {
    expect(risingCompanies([record(1, "가", "2026", 1, 0.7)], "2026", 10)).toEqual([]);
  });
});
