import type { SelectionInput, SelectionRow } from "@/lib/repositories/selectionRecord";
import type { BenchmarkRow } from "@/lib/services/benchmarking";

export const EXCELLENT_TOP_N = 10;

export type AwardWinner = { companyId: number; companyName: string; detail: string };
export type AwardCategory = { id: "three_year_excellent" | "top_growth" | "best_newcomer"; label: string; winners: AwardWinner[] };

/**
 * 순위로 등급을 정한다 — 상위 10 이 우수, 나머지는 선정이다.
 */
export function gradeOf(rank: number | null): "우수" | "선정" {
  return rank !== null && rank <= EXCELLENT_TOP_N ? "우수" : "선정";
}

/**
 * 확정 시점의 랭킹을 저장용 기록으로 동결한다. 총점 없는(미분석) 기업은 이력이 아니다.
 */
export function toSelectionInputs(rows: BenchmarkRow[], meta: { year: number; formulaVersion: string; decidedBy: number }): SelectionInput[] {
  return rows
    .filter((row): row is BenchmarkRow & { total: number } => row.total !== null)
    .map((row) => ({
      companyId: row.companyId,
      year: meta.year,
      grade: gradeOf(row.rank),
      total: row.total,
      rank: row.rank,
      metrics: row.metrics,
      formulaVersion: meta.formulaVersion,
      decidedBy: meta.decidedBy,
    }));
}

function byCompany(records: SelectionRow[]) {
  const map = new Map<number, SelectionRow[]>();
  for (const record of records) {
    map.set(record.companyId, [...(map.get(record.companyId) ?? []), record]);
  }
  return map;
}

/**
 * 저장된 확정 기록만으로 시상 카테고리를 산출한다 — 카테고리는 항상 3개, 해당자가 없으면 빈 목록이다.
 */
export function computeAwards(records: SelectionRow[], targetYear: number, topN = EXCELLENT_TOP_N): AwardCategory[] {
  const companies = byCompany(records);

  const threeYear: AwardWinner[] = [];
  const growth: Array<AwardWinner & { delta: number }> = [];
  const newcomers: Array<AwardWinner & { total: number }> = [];

  for (const [companyId, rows] of companies) {
    const of = (year: number) => rows.find((row) => row.year === year);
    const current = of(targetYear);
    if (!current) continue;

    const excellentStreak = [targetYear, targetYear - 1, targetYear - 2].every((year) => {
      const row = of(year);
      return row !== undefined && row.rank !== null && row.rank <= topN;
    });
    if (excellentStreak) {
      threeYear.push({ companyId, companyName: current.companyName, detail: `${targetYear - 2}–${targetYear} 상위 ${topN}` });
    }

    const previous = of(targetYear - 1);
    if (previous) {
      const delta = current.total - previous.total;
      if (delta > 0) {
        growth.push({ companyId, companyName: current.companyName, delta, detail: `+${delta.toFixed(2)} (${previous.total.toFixed(2)} → ${current.total.toFixed(2)})` });
      }
    }

    const firstYear = Math.min(...rows.map((row) => row.year));
    if (firstYear === targetYear) {
      newcomers.push({ companyId, companyName: current.companyName, total: current.total, detail: `첫 등록 · 총점 ${current.total.toFixed(2)}` });
    }
  }

  const maxDelta = Math.max(...growth.map((winner) => winner.delta), 0);
  const maxNewTotal = Math.max(...newcomers.map((winner) => winner.total), 0);
  return [
    { id: "three_year_excellent", label: "3년 연속 우수", winners: threeYear },
    { id: "top_growth", label: "전년 대비 최다 성장", winners: growth.filter((winner) => winner.delta === maxDelta).map(({ delta: _delta, ...winner }) => winner) },
    { id: "best_newcomer", label: "신규 최고 점수", winners: newcomers.filter((winner) => winner.total === maxNewTotal).map(({ total: _total, ...winner }) => winner) },
  ];
}
