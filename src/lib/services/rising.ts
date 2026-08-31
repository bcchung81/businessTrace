import { prevPeriod } from "@/lib/services/periods";

export type RisingInput = { companyId: number; companyName: string; period: string; rank: number | null; total: number };
export type RisingRow = { companyId: number; companyName: string; prevRank: number; rank: number; delta: number; total: number };

/**
 * 현재 순위를 기준 순위와 대조해 상승 폭 순으로 낸다 — 양쪽 모두 순위가 있어야 추이다.
 */
export function compareRanks(
  current: Array<{ companyId: number; companyName: string; rank: number | null; total: number }>,
  baseline: Array<{ companyId: number; rank: number | null }>,
  limit = 10,
): RisingRow[] {
  const prevRankOf = new Map<number, number>();
  for (const entry of baseline) {
    if (entry.rank !== null) prevRankOf.set(entry.companyId, entry.rank);
  }

  const rows: RisingRow[] = [];
  for (const entry of current) {
    if (entry.rank === null) continue;
    const prevRank = prevRankOf.get(entry.companyId);
    if (prevRank === undefined || prevRank <= entry.rank) continue;
    rows.push({
      companyId: entry.companyId,
      companyName: entry.companyName,
      prevRank,
      rank: entry.rank,
      delta: prevRank - entry.rank,
      total: entry.total,
    });
  }

  return rows.sort((a, b) => b.delta - a.delta || b.total - a.total || a.rank - b.rank).slice(0, limit);
}

/**
 * 직전 확정 기간 대비 순위가 오른 기업 — 확정 기록끼리 비교하는 이력용 사슬이다.
 */
export function risingCompanies(records: RisingInput[], targetPeriod: string, limit = 10): RisingRow[] {
  const previous = prevPeriod(targetPeriod);
  return compareRanks(
    records.filter((record) => record.period === targetPeriod),
    records.filter((record) => record.period === previous),
    limit,
  );
}
