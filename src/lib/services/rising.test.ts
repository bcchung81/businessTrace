import { describe, expect, it } from "vitest";
import { compareRanks, risingCompanies } from "@/lib/services/rising";

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
      { companyId: 1, companyName: "미타운", prevRank: 13, rank: 4, delta: 9, total: 0.56 },
      { companyId: 2, companyName: "써로마인드", prevRank: 13, rank: 6, delta: 7, total: 0.54 },
    ]);
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
      { companyId: 1, companyName: "미타운", prevRank: 13, rank: 4, delta: 9, total: 0.56 },
      { companyId: 2, companyName: "써로마인드", prevRank: 13, rank: 6, delta: 7, total: 0.54 },
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
