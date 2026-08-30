"use client";

import { useState } from "react";
import { VerdictPill } from "@/components/dashboard/verdict-pill";
import { EVIDENCE_MATCH_THRESHOLD, FAITHFULNESS_THRESHOLD, SOURCE_COVERAGE_THRESHOLD, failedGates } from "@/lib/services/verificationScores";

export type VerificationLayers = {
  status: "verified" | "needs_review";
  faithfulness: number | null;
  sourceCoverage: number;
  evidenceMatch: number;
  counterEvidence: string[];
  invalid: Array<{ title: string; link: string }>;
  cited: number;
  total: number;
  claims: Array<{ claim: string; supported: boolean; evidence: string }>;
};

function score(value: number | null, threshold: number) {
  return `${value === null ? "—" : value.toFixed(2)} · ≥${threshold}`;
}

/**
 * 판정 배지 하나로 시작해, 누르면 4층 검증 근거를 사이드 패널로 편다.
 * 탈락한 게이트를 이름으로 적는다 — "검토 필요" 만으로는 무엇을 봐야 하는지 모른다.
 */
export function VerificationPanel({ layers }: { layers: VerificationLayers | null }) {
  const [open, setOpen] = useState(false);
  if (!layers) return <VerdictPill verdict="pending" />;

  const failed = failedGates(layers);

  return (
    <>
      <button
        type="button"
        aria-label="검증 근거 열기"
        id="verification"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 border-[1.5px] border-ink px-2 py-1 text-[11px] font-bold hover:bg-secondary"
      >
        <VerdictPill verdict={layers.status === "verified" ? "verified" : "review"} />
        검증 근거
      </button>
      {open ? (
        <aside
          aria-label="검증 근거"
          className="fixed inset-y-0 right-0 z-30 flex w-[380px] max-w-full flex-col gap-5 overflow-y-auto border-l-[1.5px] border-ink bg-background p-5 text-[12.5px]"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display text-[18px] font-black">검증 근거</h3>
            <button type="button" onClick={() => setOpen(false)} className="border-[1.5px] border-ink px-2 py-0.5 text-[11px] font-bold">
              닫기
            </button>
          </div>
          {failed.length > 0 ? (
            <p className="font-semibold text-review">탈락 사유: {failed.join(" · ")}</p>
          ) : (
            <p className="font-semibold text-verified">세 게이트 모두 통과</p>
          )}
          <dl className="flex flex-col gap-3">
            <div className="border-t-2 border-ink pt-2">
              <dt className="font-bold">출처 인용</dt>
              <dd className="font-mono tabular-nums">
                {score(layers.sourceCoverage, SOURCE_COVERAGE_THRESHOLD)} · {layers.cited}/{layers.total}건
              </dd>
              {layers.invalid.length > 0 ? (
                <ul className="mt-1 text-muted-foreground">
                  {layers.invalid.map((item) => (
                    <li key={item.link}>{item.title} — 인용 불가 링크</li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="border-t-2 border-ink pt-2">
              <dt className="font-bold">근거 충실도</dt>
              <dd className="font-mono tabular-nums">{score(layers.faithfulness, FAITHFULNESS_THRESHOLD)}</dd>
              <ul className="mt-1 flex flex-col gap-1">
                {layers.claims.map((claim, index) => (
                  <li key={index} className={claim.supported ? "" : "text-review"}>
                    {claim.supported ? "지지" : "불지지"} · {claim.claim}
                    {claim.evidence ? <span className="text-muted-foreground"> — {claim.evidence}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
            <div className="border-t-2 border-ink pt-2">
              <dt className="font-bold">근거 일치</dt>
              <dd className="font-mono tabular-nums">{score(layers.evidenceMatch, EVIDENCE_MATCH_THRESHOLD)}</dd>
            </div>
            <div className="border-t-2 border-ink pt-2">
              <dt className="font-bold">반증</dt>
              <dd>
                {layers.counterEvidence.length === 0 ? (
                  <span className="text-muted-foreground">없음</span>
                ) : (
                  <ul>
                    {layers.counterEvidence.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          </dl>
        </aside>
      ) : null}
    </>
  );
}
