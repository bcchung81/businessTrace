import { gradeOf } from "@/lib/services/awards";
import { periodEndYm } from "@/lib/services/periods";

export const LIVE_PERIOD = "live";

export type HeatCell = { period: string; total: number; rank: number | null; grade: string } | null;
export type HeatRow = { companyId: number; companyName: string; cells: HeatCell[] };
export type HeatRecord = { companyId: number; companyName: string; period: string; total: number; rank: number | null; grade: string };
export type LiveStanding = { companyId: number; companyName: string; rank: number | null; total: number };

/**
 * 총점을 단일 색조 진하기로 — 점수가 높을수록 어둡다. 문턱은 실측 총점 분포(0.2~0.7)에 맞춘다.
 */
export function rampFor(total: number): string {
  if (total < 0.3) return "#eaf1ff";
  if (total < 0.4) return "#d7e3ff";
  if (total < 0.5) return "#a9c4ff";
  if (total < 0.6) return "#6d97ff";
  return "#2b6bff";
}

/**
 * 확정 기록(+선택적 실시간 열)을 기업×기간 히트맵으로 편다. 행은 마지막 열 총점 내림차순이다.
 */
export function buildScoreHeatmap(records: HeatRecord[], live: LiveStanding[] | null): { periods: string[]; rows: HeatRow[] } {
  const periods = [...new Set(records.map((record) => record.period))].sort(
    (a, b) => periodEndYm(a).localeCompare(periodEndYm(b)) || a.localeCompare(b),
  );
  if (live && live.length > 0) periods.push(LIVE_PERIOD);

  const names = new Map<number, string>();
  for (const record of records) names.set(record.companyId, record.companyName);
  for (const entry of live ?? []) names.set(entry.companyId, entry.companyName);

  const cellOf = new Map<string, HeatCell>();
  for (const record of records) {
    cellOf.set(`${record.companyId}:${record.period}`, { period: record.period, total: record.total, rank: record.rank, grade: record.grade });
  }
  for (const entry of live ?? []) {
    cellOf.set(`${entry.companyId}:${LIVE_PERIOD}`, { period: LIVE_PERIOD, total: entry.total, rank: entry.rank, grade: gradeOf(entry.rank) });
  }

  const rows: HeatRow[] = [...names.entries()].map(([companyId, companyName]) => ({
    companyId,
    companyName,
    cells: periods.map((period) => cellOf.get(`${companyId}:${period}`) ?? null),
  }));

  const latestTotal = (row: HeatRow) => [...row.cells].reverse().find((cell) => cell !== null)?.total ?? -1;
  rows.sort((a, b) => latestTotal(b) - latestTotal(a) || a.companyName.localeCompare(b.companyName, "ko"));

  return { periods, rows };
}
