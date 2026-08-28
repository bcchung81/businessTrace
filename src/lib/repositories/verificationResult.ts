import { prisma } from "@/lib/db";
import type { VerificationOutput } from "@/lib/services/verification";

/**
 * 검증 판정과 층별 점수를 저장한다. 재검증하면 덮어쓴다.
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
