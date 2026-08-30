import { prisma } from "@/lib/db";
import { listLatestVerifications } from "@/lib/repositories/verificationResult";
import type { BenchmarkInput } from "@/lib/services/benchmarking";

type Stats = { averageSentiment?: number; awardCount?: number; investmentCount?: number };

function parseStats(resultJson: string | null): Stats | null {
  if (!resultJson) return null;
  try {
    return (JSON.parse(resultJson) as { stats?: Stats }).stats ?? null;
  } catch {
    return null;
  }
}

function parseRevenue(payload: string): number | null {
  try {
    const revenue = (JSON.parse(payload) as { revenue?: number | null }).revenue;
    return typeof revenue === "number" ? revenue : null;
  } catch {
    return null;
  }
}

/**
 * 연도의 활성 기업마다 벤치마킹 지표 입력을 한 줄로 모은다.
 * 분석은 최신 완료 실행 하나만, 재무는 found 스냅샷만, 리스크는 확인된 경보만 센다 — 미확인 경보는 감점 근거가 아니다.
 */
export async function listBenchmarkInputs(year: number): Promise<BenchmarkInput[]> {
  const companies = await prisma.company.findMany({
    where: { year, isActive: true },
    orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    include: {
      analysisRuns: { where: { status: "completed" }, orderBy: { createdAt: "desc" }, take: 1, select: { resultJson: true } },
      sourceSnapshots: { where: { source: "dartFinance", status: "found" }, select: { payload: true } },
      events: { where: { severity: "alert", status: { in: ["acknowledged", "done"] } }, select: { id: true } },
    },
  });
  const verification = new Map((await listLatestVerifications(year)).map((row) => [row.companyId, row.status]));

  return companies.map((company) => {
    const stats = parseStats(company.analysisRuns[0]?.resultJson ?? null);
    return {
      companyId: company.id,
      name: company.name,
      industry: company.industry,
      sentiment: stats?.averageSentiment ?? null,
      awards: stats?.awardCount ?? null,
      investments: stats?.investmentCount ?? null,
      revenue: company.sourceSnapshots[0] ? parseRevenue(company.sourceSnapshots[0].payload) : null,
      verification: verification.get(company.id) ?? null,
      confirmedRisks: company.events.length,
    };
  });
}
