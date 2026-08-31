import { prisma } from "@/lib/db";
import type { VerificationOutput } from "@/lib/services/verification";
import type { VerificationRow } from "@/lib/services/verdictRollup";

/**
 * 검증 판정과 층별 점수, judge 토큰 사용량을 저장한다. 재검증하면 덮어쓴다.
 */
export async function saveVerification(analysisRunId: number, output: VerificationOutput) {
  const data = {
    status: output.status,
    faithfulness: output.faithfulness,
    sourceCoverage: output.sourceCoverage,
    evidenceMatch: output.evidenceMatch,
    unsupportedClaims: JSON.stringify(output.unsupportedClaims),
    counterEvidence: JSON.stringify(output.counterEvidence),
    detailJson: JSON.stringify(output.detail),
    usageJson: JSON.stringify(output.usage),
  };

  return prisma.verificationResult.upsert({
    where: { analysisRunId },
    create: { analysisRunId, ...data },
    update: data,
  });
}

/**
 * 분석 실행에 붙은 검증 결과를 찾는다.
 */
export async function findVerification(analysisRunId: number) {
  return prisma.verificationResult.findUnique({ where: { analysisRunId } });
}

function jsonLength(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

/**
 * 저장된 기사 중 분석기가 실제로 소비한 primary 만 센다 — 전체를 세면 인용 수가 부풀려진다.
 */
function primaryCitationCount(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return 0;
    const primary = parsed.filter((item) => (item as { relevance?: string }).relevance === "primary").length;
    return primary > 0 ? primary : parsed.length === 0 ? 0 : parsed.filter((item) => (item as { relevance?: string }).relevance === undefined).length;
  } catch {
    return 0;
  }
}

/**
 * 해당 연도 기업별 최신 완료 실행의 검증 결과를 낸다.
 * 기업당 하나만 쓴다 — 재실행분까지 세면 같은 기업이 두 번 잡혀 판정 수가 부풀려진다.
 */
export async function listLatestVerifications(year: number): Promise<VerificationRow[]> {
  const runs = await prisma.analysisRun.findMany({
    where: { status: "completed", company: { year, isActive: true }, verification: { isNot: null } },
    orderBy: { createdAt: "desc" },
    include: { verification: true },
  });

  const seen = new Set<number>();
  const rows: VerificationRow[] = [];

  for (const run of runs) {
    if (seen.has(run.companyId) || !run.verification) continue;
    seen.add(run.companyId);
    rows.push({
      companyId: run.companyId,
      status: run.verification.status === "verified" ? "verified" : "needs_review",
      faithfulness: run.verification.faithfulness,
      sourceCoverage: run.verification.sourceCoverage,
      evidenceMatch: run.verification.evidenceMatch,
      counterEvidence: jsonLength(run.verification.counterEvidence),
      citations: primaryCitationCount(run.newsJson),
      runAt: (run.completedAt ?? run.createdAt).toISOString(),
    });
  }

  return rows;
}
