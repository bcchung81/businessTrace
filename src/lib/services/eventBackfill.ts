import { prisma } from "@/lib/db";
import { upsertEvents } from "@/lib/repositories/eventRepository";
import { listPensionSeries } from "@/lib/repositories/pensionSnapshot";
import { listSourceSnapshots } from "@/lib/repositories/sourceSnapshot";
import type { AnalysisResult } from "@/lib/services/analyzer";
import { extractAnalysisEvents, extractPensionEvents, extractSourceEvents } from "@/lib/services/eventRules";

/**
 * 기존 데이터에서 사건을 한 번 추출한다. 기업당 최신 검증 실행·전체 연금 시계열·현재 원천 스냅샷이 입력이다. 멱등이다.
 */
export async function backfillEvents(year: number, now = new Date()) {
  const counts = { analysis: 0, pension: 0, source: 0 };

  const runs = await prisma.analysisRun.findMany({
    where: { status: "completed", company: { year, isActive: true }, verification: { isNot: null } },
    orderBy: { createdAt: "desc" }, include: { verification: true },
  });
  const seen = new Set<number>();
  for (const run of runs) {
    if (seen.has(run.companyId) || !run.verification || !run.resultJson) continue;
    seen.add(run.companyId);
    const result = JSON.parse(run.resultJson) as AnalysisResult;
    const trust = run.verification.status === "verified" ? "verified" : "needs_review";
    counts.analysis += (await upsertEvents(extractAnalysisEvents({ companyId: run.companyId, runId: run.id, result, trust }))).created;
  }

  for (const series of await listPensionSeries(year)) {
    counts.pension += (await upsertEvents(extractPensionEvents({ companyId: series.companyId, points: series.points }))).created;
  }

  const companies = await prisma.company.findMany({ where: { year, isActive: true }, select: { id: true } });
  for (const company of companies) {
    const snapshots = await listSourceSnapshots(company.id);
    counts.source += (await upsertEvents(extractSourceEvents({ companyId: company.id, snapshots, now }))).created;
  }
  return counts;
}
