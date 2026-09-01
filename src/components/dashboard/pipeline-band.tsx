import type { ReactNode } from "react";
import type { PipelineFacts } from "@/lib/services/pipelineFacts";

/**
 * 홈 밴드 — 헤드라인 대신 파이프라인 4단을 노드·연결선으로 그린다. 노드마다 큰 수 하나, 연결선에는 넘어가는 규칙.
 * 활성 노드는 primary 테두리 하나로만 표시한다(§2-F: 상태색은 판정에만).
 */
export function PipelineBand({ year, facts, summary, aside }: { year: number; facts: PipelineFacts; summary: ReactNode; aside: ReactNode }) {
  return (
    <div className="flex flex-col gap-5 bg-band px-6 pb-6 pt-7 text-band-foreground">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{year}년 우수기업 · 파이프라인 · 지난 30일</span>
          {summary}
        </div>
        <div className="flex gap-2">{aside}</div>
      </div>

      <ol aria-label="분석 파이프라인" className="flex items-stretch">
        {facts.nodes.map((node, index) => (
          <li key={node.key} className="contents" aria-current={node.active ? "step" : undefined}>
            <div
              className={`flex flex-1 flex-col gap-1.5 border-[1.5px] px-3.5 py-3 ${node.active ? "border-primary bg-primary/15" : "border-band-foreground/25 bg-band-foreground/[0.03]"}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-display text-[15px] font-black">{node.title}</h2>
                <span className="font-mono text-[10.5px] text-band-foreground/70">{node.sub}</span>
              </div>
              <div className="font-display text-[28px] font-black leading-none tabular-nums">
                {node.big}
                <span className="ml-1 font-sans text-[12px] font-medium text-band-foreground/70">{node.unit}</span>
              </div>
              <div className="flex flex-col gap-0.5 text-[11.5px] text-band-foreground/72">
                <span>{node.lines[0]}</span>
                <span>{node.lines[1]}</span>
              </div>
            </div>
            {index < facts.links.length ? (
              <div aria-hidden className="relative flex w-11 flex-none items-center justify-center">
                <span className="absolute inset-x-0 top-1/2 border-t-2 border-band-foreground/45" />
                <span className="relative bg-band px-1 font-mono text-[10px] text-band-foreground/70">{facts.links[index]}</span>
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-band-foreground/72">
        <span>산출</span>
        {facts.outputs.map((output) => (
          <b key={output} className="font-mono font-semibold text-band-foreground">{output}</b>
        ))}
        <a href={`/companies?year=${year}&filter=review`} className="ml-auto font-bold text-band-foreground underline decoration-primary underline-offset-4">
          확인 필요 {facts.reviewCompanies}개사 → 기업 상세
        </a>
      </div>
    </div>
  );
}
