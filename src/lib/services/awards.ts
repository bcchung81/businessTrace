import type { MetricScore } from "@/lib/services/benchmarking";
import type { BenchmarkRow } from "@/lib/services/benchmarking";
import { periodKindOf, prevPeriod } from "@/lib/services/periods";

export const EXCELLENT_TOP_N = 10;

export type AwardRecord = { companyId: number; companyName: string; period: string; total: number; rank: number | null };
export type SelectionDraft = {
  companyId: number;
  year: number;
  period: string;
  grade: string;
  total: number;
  rank: number | null;
  metrics: MetricScore[];
  formulaVersion: string;
  decidedBy: number;
};
export type AwardWinner = { companyId: number; companyName: string; detail: string };
export type AwardCategory = { id: "three_year_excellent" | "top_growth" | "best_newcomer"; label: string; winners: AwardWinner[] };

/**
 * 순위로 등급을 정한다 — 상위 10 이 우수, 나머지는 선정이다.
 */
export function gradeOf(rank: number | null): "우수" | "선정" {
  return rank !== null && rank <= EXCELLENT_TOP_N ? "우수" : "선정";
}

/**
 * 확정 시점의 랭킹을 기간 단위 기록으로 동결한다. 총점 없는(미분석) 기업은 이력이 아니다.
 */
export function toSelectionInputs(rows: BenchmarkRow[], meta: { year: number; period: string; formulaVersion: string; decidedBy: number }): SelectionDraft[] {
  return rows
    .filter((row): row is BenchmarkRow & { total: number } => row.total !== null)
    .map((row) => ({
      companyId: row.companyId,
      year: meta.year,
      period: meta.period,
      grade: gradeOf(row.rank),
      total: row.total,
      rank: row.rank,
      metrics: row.metrics,
      formulaVersion: meta.formulaVersion,
      decidedBy: meta.decidedBy,
    }));
}

function byCompany(records: AwardRecord[]) {
  const map = new Map<number, AwardRecord[]>();
  for (const record of records) {
    map.set(record.companyId, [...(map.get(record.companyId) ?? []), record]);
  }
  return map;
}

/**
 * 저장된 확정 기록만으로 시상 카테고리를 산출한다 — 단위는 기록의 기간(연·반기·분기)을 따르고, 카테고리는 항상 3개다.
 */
export function computeAwards(records: AwardRecord[], targetPeriod: string, topN = EXCELLENT_TOP_N): AwardCategory[] {
  const yearly = periodKindOf(targetPeriod) === "year";
  const previous = prevPeriod(targetPeriod);
  const beforePrevious = prevPeriod(previous);
  const companies = byCompany(records);

  const threeStreak: AwardWinner[] = [];
  const growth: Array<AwardWinner & { delta: number }> = [];
  const newcomers: Array<AwardWinner & { total: number }> = [];

  for (const [companyId, rows] of companies) {
    const of = (period: string) => rows.find((row) => row.period === period);
    const current = of(targetPeriod);
    if (!current) continue;

    const excellentStreak = [targetPeriod, previous, beforePrevious].every((period) => {
      const row = of(period);
      return row !== undefined && row.rank !== null && row.rank <= topN;
    });
    if (excellentStreak) {
      threeStreak.push({ companyId, companyName: current.companyName, detail: `${beforePrevious}–${targetPeriod} 상위 ${topN}` });
    }

    const prev = of(previous);
    if (prev) {
      const delta = current.total - prev.total;
      if (delta > 0) {
        growth.push({ companyId, companyName: current.companyName, delta, detail: `+${delta.toFixed(2)} (${prev.total.toFixed(2)} → ${current.total.toFixed(2)})` });
      }
    }

    const firstPeriod = [...rows].sort((a, b) => a.period.localeCompare(b.period))[0]?.period;
    if (firstPeriod === targetPeriod) {
      newcomers.push({ companyId, companyName: current.companyName, total: current.total, detail: `첫 등록 · 총점 ${current.total.toFixed(2)}` });
    }
  }

  const maxDelta = Math.max(...growth.map((winner) => winner.delta), 0);
  const maxNewTotal = Math.max(...newcomers.map((winner) => winner.total), 0);
  return [
    { id: "three_year_excellent", label: yearly ? "3년 연속 우수" : "3기 연속 우수", winners: threeStreak },
    { id: "top_growth", label: yearly ? "전년 대비 최다 성장" : "전기 대비 최다 성장", winners: growth.filter((winner) => winner.delta === maxDelta).map(({ delta: _delta, ...winner }) => winner) },
    { id: "best_newcomer", label: "신규 최고 점수", winners: newcomers.filter((winner) => winner.total === maxNewTotal).map(({ total: _total, ...winner }) => winner) },
  ];
}
