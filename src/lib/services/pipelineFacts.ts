import type { Verdict } from "@/lib/services/verdictRollup";

export type PipelineInputs = {
  companies: number;
  articles: number;
  duplicatesRemoved: number;
  analysed: number;
  noNews: number;
  running: number;
  latestRunAt: string | null;
  counts: Record<Verdict, number>;
  gateDropouts: { source: number; faithfulness: number; evidence: number };
  cells: { found: number; conflict: number; pending: number; absent: number; unmeasurable: number };
  events30: number;
  staleNews: number;
  reviewCompanies: number;
  monthLabel: string;
};

export type PipelineNode = { key: "collect" | "analyse" | "verify" | "check"; title: string; sub: string; big: string; unit: string; lines: [string, string]; active: boolean };
export type PipelineFacts = { nodes: PipelineNode[]; links: [string, string, string]; outputs: [string, string, string]; reviewCompanies: number };

const SOURCE_COUNT = 7;

function topDropout(gates: PipelineInputs["gateDropouts"]) {
  const entries: Array<[string, number]> = [["출처 인용", gates.source], ["근거 충실도", gates.faithfulness], ["근거 일치", gates.evidence]];
  const [name, count] = entries.sort((a, b) => b[1] - a[1])[0];
  return count > 0 ? `탈락 사유 1위 ${name}` : "탈락 없음";
}

/**
 * 홈 밴드의 파이프라인 4단 — 노드마다 큰 수 하나와 보조 두 줄, 연결선에는 다음 단으로 넘어가는 규칙.
 * 활성 노드는 지금 사람 손이 가는 곳이다: 돌고 있으면 분석, 아니면 검토가 남은 검증.
 */
export function buildPipelineFacts(input: PipelineInputs): PipelineFacts {
  const totalCells = input.companies * SOURCE_COUNT;
  const hasReview = input.counts.review > 0 || input.counts.risk > 0;
  const nodes: PipelineNode[] = [
    {
      key: "collect", title: "수집", sub: "네이버 · 구글", big: input.articles.toLocaleString("en-US"), unit: "기사",
      lines: [`${input.analysed + input.noNews}/${input.companies}개사 · 중복 제거 ${input.duplicatesRemoved}`, `최근 보도 30일 초과 ${input.staleNews}개사`], active: false,
    },
    {
      key: "analyse", title: "분석", sub: "Anthropic", big: String(input.analysed), unit: `/${input.companies}개사`,
      lines: ["감성 · 수상 · 투자 · 종합의견", input.running > 0 ? `실행 중 ${input.running} · 기사 없음 ${input.noNews}` : `기사 없음 ${input.noNews} → 별칭 필요`], active: input.running > 0,
    },
    {
      key: "verify", title: "검증", sub: "4층", big: String(input.counts.verified), unit: "통과",
      lines: [`검토 필요 ${input.counts.review} · 리스크 ${input.counts.risk} · 미분석 ${input.counts.pending}`, topDropout(input.gateDropouts)], active: input.running === 0 && hasReview,
    },
    {
      key: "check", title: "대조", sub: "원천 7", big: String(input.cells.found), unit: `/${totalCells}칸`,
      lines: [`충돌 ${input.cells.conflict} · 미조회 ${input.cells.pending}`, `결측 ${input.cells.absent} · 측정 불가 ${input.cells.unmeasurable}`], active: false,
    },
  ];
  return {
    nodes,
    links: ["primary 기사만", "judge", "사업자번호"],
    outputs: [`사건 ${input.events30}건 (30일)`, `랭킹 ${input.companies}개사`, `월간 문서 ${input.monthLabel}`],
    reviewCompanies: input.reviewCompanies,
  };
}
