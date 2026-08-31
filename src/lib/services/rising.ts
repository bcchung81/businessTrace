import { prevPeriod } from "@/lib/services/periods";

export type RisingInput = { companyId: number; companyName: string; period: string; rank: number | null; total: number };
export type RisingRow = { companyId: number; companyName: string; prevRank: number; rank: number; delta: number; total: number };

/**
 * 직전 확정 기간 대비 순위가 오른 기업을 상승 폭 순으로 낸다 — 두 기간 모두 순위가 있어야 추이다.
 */
export function risingCompanies(records: RisingInput[], targetPeriod: string, limit = 10): RisingRow[] {
  const previous = prevPeriod(targetPeriod);
  const prevRankOf = new Map<number, number>();
  for (const record of records) {
    if (record.period === previous && record.rank !== null) prevRankOf.set(record.companyId, record.rank);
  }

  const rows: RisingRow[] = [];
  for (const record of records) {
    if (record.period !== targetPeriod || record.rank === null) continue;
    const prevRank = prevRankOf.get(record.companyId);
    if (prevRank === undefined || prevRank <= record.rank) continue;
    rows.push({
      companyId: record.companyId,
      companyName: record.companyName,
      prevRank,
      rank: record.rank,
      delta: prevRank - record.rank,
      total: record.total,
    });
  }

  return rows.sort((a, b) => b.delta - a.delta || b.total - a.total || a.rank - b.rank).slice(0, limit);
}
