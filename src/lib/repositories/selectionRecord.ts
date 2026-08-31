import { prisma } from "@/lib/db";
import type { MetricScore } from "@/lib/services/benchmarking";

export type SelectionInput = {
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
export type SelectionRow = SelectionInput & { companyName: string; decidedAt: string };

/**
 * 시상 확정 기록을 (기업, 기간) 단위로 upsert 한다 — 같은 기간의 재확정은 덮어쓴다.
 */
export async function saveSelections(rows: SelectionInput[]): Promise<number> {
  for (const row of rows) {
    const data = {
      year: row.year,
      grade: row.grade,
      total: row.total,
      rank: row.rank,
      metricsJson: JSON.stringify(row.metrics),
      formulaVersion: row.formulaVersion,
      decidedAt: new Date(),
      decidedBy: row.decidedBy,
    };
    await prisma.selectionRecord.upsert({
      where: { companyId_period: { companyId: row.companyId, period: row.period } },
      create: { companyId: row.companyId, period: row.period, ...data },
      update: data,
    });
  }
  return rows.length;
}

/**
 * 확정 기록을 기간 오름차순 → 총점 내림차순으로 낸다. 추이·시상 산출이 이 순서를 전제한다.
 */
export async function listSelections(filter: { year?: number } = {}): Promise<SelectionRow[]> {
  const rows = await prisma.selectionRecord.findMany({
    where: filter.year === undefined ? {} : { year: filter.year },
    orderBy: [{ period: "asc" }, { total: "desc" }],
    include: { company: { select: { name: true } } },
  });
  return rows.map((row) => ({
    companyId: row.companyId,
    companyName: row.company.name,
    year: row.year,
    period: row.period,
    grade: row.grade,
    total: row.total,
    rank: row.rank,
    metrics: JSON.parse(row.metricsJson) as MetricScore[],
    formulaVersion: row.formulaVersion,
    decidedAt: row.decidedAt.toISOString(),
    decidedBy: row.decidedBy,
  }));
}

export async function listSelectionYears(): Promise<number[]> {
  const rows = await prisma.selectionRecord.findMany({ select: { year: true }, distinct: ["year"], orderBy: { year: "desc" } });
  return rows.map((row) => row.year);
}
