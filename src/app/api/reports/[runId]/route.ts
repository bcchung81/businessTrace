import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { buildExplanation } from "@/lib/repositories/explainInputs";
import { findVerification } from "@/lib/repositories/verificationResult";
import type { AnalysisResult } from "@/lib/services/analyzer";
import { buildReport, reportFileName } from "@/lib/services/reportExcel";
import type { VerificationOutput } from "@/lib/services/verification";

export async function GET(_request: Request, context: RouteContext<"/api/reports/[runId]">) {
  if (!(await auth())?.user) return Response.json({ message: "unauthorized" }, { status: 401 });

  const { runId } = await context.params;
  const run = await prisma.analysisRun.findUnique({ where: { id: Number(runId) } });
  if (!run) return Response.json({ message: "분석 기록을 찾을 수 없습니다." }, { status: 404 });
  if (!run.resultJson) {
    return Response.json({ message: "아직 완료되지 않은 분석입니다." }, { status: 409 });
  }

  const result = JSON.parse(run.resultJson) as AnalysisResult;
  const stored = await findVerification(run.id);
  const verification: VerificationOutput | undefined = stored
    ? {
        status: stored.status as VerificationOutput["status"],
        faithfulness: stored.faithfulness,
        sourceCoverage: stored.sourceCoverage ?? 0,
        evidenceMatch: stored.evidenceMatch ?? 0,
        unsupportedClaims: JSON.parse(stored.unsupportedClaims),
        counterEvidence: JSON.parse(stored.counterEvidence),
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
        detail: JSON.parse(stored.detailJson),
      }
    : undefined;

  const explanation = await buildExplanation(run.companyId);
  const buffer = await buildReport({ result, verification, contributions: explanation?.contributions });
  const filename = reportFileName(result.companyName, run.completedAt ?? new Date());

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
