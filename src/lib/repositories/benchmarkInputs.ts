import { prisma } from "@/lib/db";
import { listLatestVerifications } from "@/lib/repositories/verificationResult";
import type { BenchmarkInput, GrowthSignals } from "@/lib/services/benchmarking";
import { growthRate, headcountGrowth, hiringBalance, procurementGrowth, type AwardYear } from "@/lib/services/growthSignals";

type Stats = { averageSentiment?: number; awardCount?: number; investmentCount?: number };

function parseStats(resultJson: string | null): Stats | null {
  if (!resultJson) return null;
  try {
    return (JSON.parse(resultJson) as { stats?: Stats }).stats ?? null;
  } catch {
    return null;
  }
}

function parsePayload<T>(payload: string | undefined): T | null {
  if (!payload) return null;
  try {
    return JSON.parse(payload) as T;
  } catch {
    return null;
  }
}

type FinancePayload = { revenue?: number | null; previous?: { revenue?: number | null } };
type ProcurementPayload = { total?: number; years?: AwardYear[] };

/** 가장 최근 달의 가입자 수. 측정된 달이 없으면 null. */
function latestSubscribers(points: Array<{ ym: string; subscribers: number | null }>): number | null {
  const measured = points.filter((point) => point.subscribers !== null).sort((a, b) => a.ym.localeCompare(b.ym));
  return measured.at(-1)?.subscribers ?? null;
}

/**
 * 연도의 활성 기업마다 벤치마킹 지표 입력을 한 줄로 모은다.
 * 분석은 최신 완료 실행 하나만, 재무는 found 스냅샷만, 리스크는 확인된 경보만 센다 — 미확인 경보는 감점 근거가 아니다.
 * 성장 신호는 커버리지가 제각각이라(고용 98% · 조달 46% · 재무 23%) 못 잰 것은 반드시 null 이다 — 0 으로 적으면 미참여가 정체로 읽힌다.
 * 검증이 실행되지 못한 런은 결측으로 둔다 — 못 잰 것을 0 점으로 적으면 없는 판정을 만들어낸다.
 */
export async function listBenchmarkInputs(year: number, now: Date = new Date()): Promise<BenchmarkInput[]> {
  const companies = await prisma.company.findMany({
    where: { year, isActive: true },
    orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    include: {
      analysisRuns: { where: { status: "completed" }, orderBy: { createdAt: "desc" }, take: 1, select: { resultJson: true } },
      sourceSnapshots: { where: { source: { in: ["dartFinance", "procurement"] }, status: "found" }, select: { source: true, payload: true } },
      pensionSnapshots: { select: { ym: true, subscribers: true, hired: true, departed: true } },
      events: { where: { severity: "alert", status: { in: ["acknowledged", "done"] } }, select: { id: true } },
    },
  });
  const verification = new Map(
    (await listLatestVerifications(year))
      .filter((row) => row.status !== "failed")
      .map((row) => [row.companyId, row.status as "verified" | "needs_review"]),
  );

  return companies.map((company) => {
    const stats = parseStats(company.analysisRuns[0]?.resultJson ?? null);
    const finance = parsePayload<FinancePayload>(company.sourceSnapshots.find((s) => s.source === "dartFinance")?.payload);
    const procurement = parsePayload<ProcurementPayload>(company.sourceSnapshots.find((s) => s.source === "procurement")?.payload);

    const pension = company.pensionSnapshots.map((point) => ({ ...point, noticeAmount: null }));
    const growth: GrowthSignals = {
      revenue: growthRate(finance?.revenue ?? null, finance?.previous?.revenue),
      headcount: headcountGrowth(pension),
      hiring: hiringBalance(pension),
      procurement: procurementGrowth(procurement?.years ?? [], now),
    };

    return {
      companyId: company.id,
      name: company.name,
      industry: company.industry,
      sentiment: stats?.averageSentiment ?? null,
      awards: stats?.awardCount ?? null,
      investments: stats?.investmentCount ?? null,
      revenue: finance?.revenue ?? null,
      procurementTotal: procurement?.total ?? null,
      headcount: latestSubscribers(pension),
      growth,
      verification: verification.get(company.id) ?? null,
      confirmedRisks: company.events.length,
    };
  });
}
