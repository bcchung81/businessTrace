import type { ReactNode } from "react";
import type { PipelineFacts } from "@/lib/services/pipelineFacts";

/**
 * 홈 밴드 — 헤드라인 대신 파이프라인 4단을 노드로 그린다. 노드마다 큰 수 하나와 손이 가야 하는 것 한 줄.
 * 연결선에는 글자를 얹지 않는다 — 넘어가는 규칙은 화면을 설명하는 말이지 운영자가 쓰는 정보가 아니다.
 * 활성 노드는 primary 테두리 하나로만 표시한다(§2-F: 상태색은 판정에만).
 */
export function PipelineBand({
  year,
  facts,
  summary,
  aside,
  search,
}: {
  year: number;
  facts: PipelineFacts;
  summary: ReactNode;
  aside: ReactNode;
  search: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 bg-band px-6 pb-6 pt-7 text-band-foreground">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{year}년 우수기업 · 지난 30일</span>
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
              <h2 className="font-display text-[15px] font-black">{node.title}</h2>
              <div className="font-display text-[28px] font-black leading-none tabular-nums">
                {node.big}
                <span className="ml-1 font-sans text-[12px] font-medium text-band-foreground/70">{node.unit}</span>
              </div>
              <span className="text-[11.5px] text-band-foreground/72">{node.line}</span>
            </div>
            {index < facts.nodes.length - 1 ? (
              <div aria-hidden className="flex w-8 flex-none items-center">
                <span className="w-full border-t-2 border-band-foreground/45" />
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      <div className="flex justify-end">{search}</div>
    </div>
  );
}
