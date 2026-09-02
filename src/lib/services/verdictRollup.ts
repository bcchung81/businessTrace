import type { CompanyPipelineRow } from "@/lib/repositories/companyPipeline";
import { conflictStages } from "@/lib/services/pipelineMatrix";
import {
  EVIDENCE_MATCH_THRESHOLD,
  FAITHFULNESS_THRESHOLD,
  SOURCE_COVERAGE_THRESHOLD,
  type VerificationStatus,
} from "@/lib/services/verificationScores";

export type Verdict = "verified" | "review" | "risk" | "pending";

export type VerificationRow = {
  companyId: number;
  status: VerificationStatus;
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

/** 화면과 엑셀이 함께 쓰는 판정 이름 — 두 벌로 두면 산식이 갈린다. */
export const VERDICT_LABEL: Record<Verdict, string> = {
  verified: "통과",
  review: "검토",
  risk: "리스크",
  pending: "미분석",
};

/** 봐야 할 순서 — 막힌 것이 먼저다. */
export const VERDICT_ORDER: Verdict[] = ["risk", "review", "verified", "pending"];

function decideVerdict(row: VerificationRow | undefined, conflicts: string[]): Verdict {
  if (!row) return "pending";
  if (conflicts.length > 0) return "risk";
  if (row.status === "failed") return "pending";
  return row.status === "verified" ? "verified" : "review";
}

/**
 * 검증 3분류(verified/needs_review/failed)를 대시보드 4분류로 파생한다.
 * 검증이 실행되지 못한 런(failed)은 검토가 아니라 판정 없음이다 — 사람이 읽을 것이 아니라 다시 돌려야 한다.
 * 리스크는 파이프라인이 내는 상태가 아니다 — 원천 충돌(동명 타사)이 있으면 judge 판정보다 우선한다.
 * 반증 건수는 리스크에 넣지 않는다. 실측에서 6/6 이 "보도자료 의존" 같은 유의사항이었다.
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

  const analysed = input.verifications.filter((row) => row.status !== "failed");
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

/**
 * 미분석(pending) 판정을 받은 기업들의 companyId를 추출한다.
 */
export function pendingCompanyIds(companies: Array<{ companyId: number; verdict: string }>): number[] {
  return companies.filter((entry) => entry.verdict === "pending").map((entry) => entry.companyId);
}
