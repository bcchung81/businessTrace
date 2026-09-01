import { SOURCE_KEYS } from "@/lib/services/sourceEvidence";
import type { Verdict } from "@/lib/services/verdictRollup";

export type PipelineInputs = {
  companies: number;
  articles: number;
  analysed: number;
  noNews: number;
  running: number;
  counts: Record<Verdict, number>;
  cells: { found: number; conflict: number; pending: number; absent: number; unmeasurable: number };
  staleNews: number;
  reviewCompanies: number;
};

export type PipelineNode = { key: "collect" | "analyse" | "verify" | "check"; title: string; big: string; unit: string; line: string; active: boolean };
export type PipelineFacts = { nodes: PipelineNode[]; reviewCompanies: number };

/** 대조 분모는 실제로 적재하는 원천 수에서 온다 — 손으로 적으면 원천을 늘릴 때 분모만 조용히 틀어진다. */
const SOURCE_COUNT = SOURCE_KEYS.length;

/**
 * 홈 밴드의 파이프라인 4단 — 노드마다 큰 수 하나와 손이 가야 하는 것 한 줄.
 * 단계가 무슨 일을 하는지 설명하는 말(공급자·분석 항목·탈락 사유)은 넣지 않는다 — 그걸 보고 정하는 것이 없다.
 * 활성 노드는 지금 사람 손이 가는 곳이다: 돌고 있으면 분석, 아니면 검토가 남은 검증.
 */
export function buildPipelineFacts(input: PipelineInputs): PipelineFacts {
  const totalCells = input.companies * SOURCE_COUNT;
  const hasReview = input.counts.review > 0 || input.counts.risk > 0;
  const nodes: PipelineNode[] = [
    {
      key: "collect", title: "수집", big: input.articles.toLocaleString("en-US"), unit: "기사",
      line: `보도 30일 초과 ${input.staleNews}개사`, active: false,
    },
    {
      key: "analyse", title: "분석", big: String(input.analysed), unit: `/${input.companies}개사`,
      line: input.running > 0 ? `실행 중 ${input.running} · 기사 없음 ${input.noNews}` : `기사 없음 ${input.noNews} → 별칭 필요`,
      active: input.running > 0,
    },
    {
      key: "verify", title: "검증", big: String(input.counts.verified), unit: "통과",
      line: `검토 필요 ${input.counts.review} · 리스크 ${input.counts.risk} · 미분석 ${input.counts.pending}`,
      active: input.running === 0 && hasReview,
    },
    {
      key: "check", title: "대조", big: String(input.cells.found), unit: `/${totalCells}칸`,
      line: `충돌 ${input.cells.conflict} · 미조회 ${input.cells.pending}`, active: false,
    },
  ];
  return { nodes, reviewCompanies: input.reviewCompanies };
}
