import { prevPeriod } from "@/lib/services/periods";

export type RisingInput = { companyId: number; companyName: string; period: string; rank: number | null; total: number };
export type RisingRow = { companyId: number; companyName: string; prevRank: number; rank: number; delta: number; total: number };

type Standing = { companyId: number; companyName: string; rank: number | null; total: number };
type Baseline = Array<{ companyId: number; rank: number | null }>;

function rankMoves(current: Standing[], baseline: Baseline, keep: (prevRank: number, rank: number) => boolean, delta: (prevRank: number, rank: number) => number): RisingRow[] {
  const prevRankOf = new Map<number, number>();
  for (const entry of baseline) {
    if (entry.rank !== null) prevRankOf.set(entry.companyId, entry.rank);
  }

  const rows: RisingRow[] = [];
  for (const entry of current) {
    if (entry.rank === null) continue;
    const prevRank = prevRankOf.get(entry.companyId);
    if (prevRank === undefined || !keep(prevRank, entry.rank)) continue;
    rows.push({
      companyId: entry.companyId,
      companyName: entry.companyName,
      prevRank,
      rank: entry.rank,
      delta: delta(prevRank, entry.rank),
      total: entry.total,
    });
  }

  return rows.sort((a, b) => b.delta - a.delta || b.total - a.total || a.rank - b.rank);
}

/**
 * 현재 순위를 기준 순위와 대조해 상승 폭 순으로 낸다 — 양쪽 모두 순위가 있어야 추이다.
 */
export function compareRanks(current: Standing[], baseline: Baseline, limit = 10): RisingRow[] {
  return rankMoves(current, baseline, (prev, rank) => prev > rank, (prev, rank) => prev - rank).slice(0, limit);
}

/**
 * 기준 대비 순위가 내려간 기업을 하락 폭 순으로 낸다 — 리스크 검토의 출발점이다.
 */
export function fallingRanks(current: Standing[], baseline: Baseline, limit = 10): RisingRow[] {
  return rankMoves(current, baseline, (prev, rank) => prev < rank, (prev, rank) => rank - prev).slice(0, limit);
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
