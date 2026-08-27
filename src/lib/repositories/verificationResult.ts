import { prisma } from "@/lib/db";
import type { VerificationOutput } from "@/lib/services/verification";

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

export async function findVerification(analysisRunId: number) {
  return prisma.verificationResult.findUnique({ where: { analysisRunId } });
}
