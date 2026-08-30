import { prisma } from "@/lib/db";
import { listBenchmarkInputs } from "@/lib/repositories/benchmarkInputs";
import { findVerification } from "@/lib/repositories/verificationResult";
import type { VerificationLayers } from "@/components/company/verification-panel";
import type { AnalysisResult } from "@/lib/services/analyzer";
import { loadRubrics, rankCompanies } from "@/lib/services/benchmarking";
import type { FinancialSummary } from "@/lib/services/dart";
import {
  citeOpinion,
  explainScore,
  summariseEvidence,
  type CitedSentence,
  type Contribution,
  type EvidenceSummary,
} from "@/lib/services/explainer";
import type { VerificationOutput } from "@/lib/services/verification";

export type Explanation = {
  contributions: Contribution[];
  total: number | null;
  evidence: EvidenceSummary;
  sentences: CitedSentence[];
  layers: VerificationLayers | null;
  runId: number | null;
};

function parse<T>(json: string | null): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function toLayers(stored: NonNullable<Awaited<ReturnType<typeof findVerification>>>): VerificationLayers {
  const detail = parse<VerificationOutput["detail"]>(stored.detailJson);
  return {
    status: stored.status === "verified" ? "verified" : "needs_review",
    faithfulness: stored.faithfulness,
    sourceCoverage: stored.sourceCoverage ?? 0,
    evidenceMatch: stored.evidenceMatch ?? 0,
    counterEvidence: parse<string[]>(stored.counterEvidence) ?? [],
    invalid: detail?.layer1?.invalid ?? [],
    cited: detail?.layer1?.cited ?? 0,
    total: detail?.layer1?.total ?? 0,
    claims: detail?.layer2?.claims ?? [],
  };
}

/**
 * 기업 하나의 설명 자료를 조립한다 — 벤치마킹 행은 같은 연도 전체를 다시 점수화해서 얻는다(정규화는 코호트 상대값이다).
 */
export async function buildExplanation(companyId: number): Promise<Explanation | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      analysisRuns: { where: { status: "completed" }, orderBy: { createdAt: "desc" }, take: 1, select: { id: true, resultJson: true } },
      sourceSnapshots: { where: { source: "dartFinance", status: "found" }, select: { payload: true } },
    },
  });
  if (!company) return null;

  const run = company.analysisRuns[0] ?? null;
  const result = run ? parse<AnalysisResult>(run.resultJson) : null;
  const stored = run ? await findVerification(run.id) : null;
  const layers = stored ? toLayers(stored) : null;
  const finance = company.sourceSnapshots[0] ? parse<FinancialSummary>(company.sourceSnapshots[0].payload) : null;

  const book = loadRubrics();
  const row = rankCompanies(await listBenchmarkInputs(company.year), book).find((entry) => entry.companyId === company.id);

  return {
    contributions: row ? explainScore(row) : [],
    total: row?.total ?? null,
    evidence: summariseEvidence({ result, finance, verification: layers?.status ?? null }),
    sentences: result ? citeOpinion(result.comprehensiveOpinion, result.analyses) : [],
    layers,
    runId: run?.id ?? null,
  };
}
