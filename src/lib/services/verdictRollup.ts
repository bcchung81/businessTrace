import type { CompanyPipelineRow } from "@/lib/repositories/companyPipeline";
import { conflictStages } from "@/lib/services/pipelineMatrix";
import {
  EVIDENCE_MATCH_THRESHOLD,
  FAITHFULNESS_THRESHOLD,
  SOURCE_COVERAGE_THRESHOLD,
} from "@/lib/services/verificationScores";

export type Verdict = "verified" | "review" | "risk" | "pending";

export type VerificationRow = {
  companyId: number;
  status: "verified" | "needs_review";
  faithfulness: number | null;
  sourceCoverage: number | null;
  evidenceMatch: number | null;
  counterEvidence: number;
  citations: number;
  runAt: string;
};

export type CompanyVerdict = {
  companyId: number;
  name: string;
  verdict: Verdict;
  faithfulness: number | null;
  sourceCoverage: number | null;
  evidenceMatch: number | null;
  citations: number;
  counterEvidence: number;
  conflicts: string[];
  runAt: string | null;
};

export type VerdictSummary = {
  companies: CompanyVerdict[];
  counts: Record<Verdict, number>;
  gates: { source: number; faithfulness: number; evidence: number; analysed: number };
  gateDropouts: { source: number; faithfulness: number; evidence: number };
  averageCitations: number;
};

/** 반증이 이 건수 이상이면 리스크다. 첫 실측 뒤 조정한다. */
export const COUNTER_EVIDENCE_RISK_THRESHOLD = 1;

/** 봐야 할 순서 — 막힌 것이 먼저다. */
export const VERDICT_ORDER: Verdict[] = ["risk", "review", "verified", "pending"];

function decideVerdict(row: VerificationRow | undefined, conflicts: string[]): Verdict {
  if (!row) return "pending";
  if (row.counterEvidence >= COUNTER_EVIDENCE_RISK_THRESHOLD || conflicts.length > 0) return "risk";
  return row.status === "verified" ? "verified" : "review";
}

/**
 * 검증 2분류(verified/needs_review)를 대시보드 4분류로 파생한다.
 * 리스크는 파이프라인이 내는 상태가 아니다 — 반증 또는 원천 충돌이 있으면 judge 판정보다 우선한다.
 */
export function rollupVerdicts(input: {
  companies: Array<{ id: number; name: string }>;
  verifications: VerificationRow[];
  pipeline: CompanyPipelineRow[];
}): VerdictSummary {
  const byCompany = new Map(input.verifications.map((row) => [row.companyId, row]));
  const pipelineById = new Map(input.pipeline.map((row) => [row.id, row]));
  const counts: Record<Verdict, number> = { verified: 0, review: 0, risk: 0, pending: 0 };

  const companies = input.companies.map((company) => {
    const row = byCompany.get(company.id);
    const conflicts = conflictStages(pipelineById.get(company.id)?.cells ?? {});
    const verdict = decideVerdict(row, conflicts);
    counts[verdict] += 1;
    return {
      companyId: company.id,
      name: company.name,
      verdict,
      faithfulness: row?.faithfulness ?? null,
      sourceCoverage: row?.sourceCoverage ?? null,
      evidenceMatch: row?.evidenceMatch ?? null,
      citations: row?.citations ?? 0,
      counterEvidence: row?.counterEvidence ?? 0,
      conflicts,
      runAt: row?.runAt ?? null,
    };
  });

  const analysed = input.verifications;
  const passedSource = analysed.filter((row) => (row.sourceCoverage ?? 0) >= SOURCE_COVERAGE_THRESHOLD);
  const passedFaith = passedSource.filter((row) => (row.faithfulness ?? 0) >= FAITHFULNESS_THRESHOLD);
  const passedEvidence = passedFaith.filter((row) => (row.evidenceMatch ?? 0) >= EVIDENCE_MATCH_THRESHOLD);

  const totalCitations = analysed.reduce((sum, row) => sum + row.citations, 0);

  return {
    companies,
    counts,
    gates: {
      analysed: analysed.length,
      source: passedSource.length,
      faithfulness: passedFaith.length,
      evidence: passedEvidence.length,
    },
    gateDropouts: {
      source: analysed.length - passedSource.length,
      faithfulness: passedSource.length - passedFaith.length,
      evidence: passedFaith.length - passedEvidence.length,
    },
    averageCitations: analysed.length === 0 ? 0 : Math.round((totalCitations / analysed.length) * 10) / 10,
  };
}

/**
 * 리스크 → 검토 → 통과 → 미분석, 같은 판정 안에서는 근거충실도가 낮은 순.
 */
export function sortForTriage<T extends { verdict: Verdict; faithfulness: number | null; name: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((left, right) => {
    const order = VERDICT_ORDER.indexOf(left.verdict) - VERDICT_ORDER.indexOf(right.verdict);
    if (order !== 0) return order;
    const faith = (left.faithfulness ?? Number.POSITIVE_INFINITY) - (right.faithfulness ?? Number.POSITIVE_INFINITY);
    if (faith !== 0) return faith;
    return left.name.localeCompare(right.name, "ko");
  });
}
