import { prisma } from "@/lib/db";

export type DecisionSource = "nps" | "dart" | "fsc";
export type SourceDecisionRow = { source: DecisionSource; value: string; label: string | null; decidedAt: string };

function toRow(row: { source: string; value: string; label: string | null; decidedAt: Date }): SourceDecisionRow {
  return { source: row.source as DecisionSource, value: row.value, label: row.label, decidedAt: row.decidedAt.toISOString() };
}

/**
 * 동명 충돌을 사람이 고른 결과를 기업×원천 한 줄로 둔다. 다시 고르면 덮어쓴다.
 */
export async function saveSourceDecision(input: {
  companyId: number;
  source: DecisionSource;
  value: string;
  label?: string | null;
  userId: number;
}): Promise<SourceDecisionRow> {
  const row = await prisma.sourceDecision.upsert({
    where: { companyId_source: { companyId: input.companyId, source: input.source } },
    create: { companyId: input.companyId, source: input.source, value: input.value, label: input.label ?? null, decidedBy: input.userId },
    update: { value: input.value, label: input.label ?? null, decidedBy: input.userId, decidedAt: new Date() },
  });
  return toRow(row);
}

export async function listSourceDecisions(companyId: number): Promise<SourceDecisionRow[]> {
  const rows = await prisma.sourceDecision.findMany({ where: { companyId }, orderBy: { source: "asc" } });
  return rows.map(toRow);
}

export async function clearSourceDecision(companyId: number, source: DecisionSource): Promise<void> {
  await prisma.sourceDecision.deleteMany({ where: { companyId, source } });
}
