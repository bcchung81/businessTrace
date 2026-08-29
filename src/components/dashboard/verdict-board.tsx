import { VERDICT_LABEL } from "@/components/dashboard/verdict-pill";
import type { Verdict } from "@/lib/services/verdictRollup";

const BOARD_ORDER: Verdict[] = ["verified", "review", "risk", "pending"];

const TITLE: Record<Verdict, string> = {
  verified: "검증 통과",
  review: "검토 필요",
  risk: "리스크",
  pending: "미분석",
};

const FILL: Record<Verdict, string> = {
  verified: "bg-verified-fill",
  review: "bg-review-fill",
  risk: "bg-risk-fill",
  pending: "hatch border border-border bg-background",
};

const EDGE: Record<Verdict, string> = {
  verified: "border-verified-fill",
  review: "border-review-fill",
  risk: "border-risk-fill",
  pending: "border-pending-fill",
};

function note(verdict: Verdict, averageCitations: number) {
  switch (verdict) {
    case "verified":
      return (
        <>
          근거 인용 평균 <b className="font-mono text-foreground">{averageCitations}</b>건
        </>
      );
    case "review":
      return "근거충실도 0.5~0.85 · 사람이 봐야 한다";
    case "risk":
      return "반증 발견 또는 원천 충돌";
    default:
      return "뉴스 수집 전 · 분석을 돌리지 않았다";
  }
}

/**
 * 판정 4분류를 비율 막대 하나와 네 칸으로 보인다.
 * 미분석은 색이 아니라 빗금이다 — 매트릭스의 결측과 같은 문법이어야 한다.
 */
export function VerdictBoard({
  counts,
  averageCitations,
}: {
  counts: Record<Verdict, number>;
  averageCitations: number;
}) {
  const total = BOARD_ORDER.reduce((sum, verdict) => sum + counts[verdict], 0);
  const share = (verdict: Verdict) => (total === 0 ? 0 : Math.round((counts[verdict] / total) * 100));

  return (
    <div className="flex flex-col gap-4 p-5">
      <div
        role="img"
        aria-label={`판정 비율 — ${BOARD_ORDER.map((v) => `${VERDICT_LABEL[v]} ${counts[v]}`).join(", ")}`}
        className="flex h-3.5 gap-0.5 overflow-hidden rounded-md"
      >
        {BOARD_ORDER.map((verdict) => (
          <div
            key={verdict}
            className={FILL[verdict]}
            style={{ flexGrow: total === 0 ? 1 : counts[verdict], flexBasis: 0 }}
          />
        ))}
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {BOARD_ORDER.map((verdict) => (
          <div
            key={verdict}
            role="group"
            aria-label={TITLE[verdict]}
            className={`flex flex-col gap-1 border-l-[3px] pl-3 ${EDGE[verdict]}`}
          >
            <span className="text-[11.5px] font-semibold text-muted-foreground">{TITLE[verdict]}</span>
            <span className="flex items-baseline gap-1.5">
              <span className="font-mono text-[30px] font-semibold leading-none tabular-nums">{counts[verdict]}</span>
              <span className="font-mono text-[12px] text-muted-foreground tabular-nums">{share(verdict)}%</span>
            </span>
            <span className="text-[11.5px] text-muted-foreground">{note(verdict, averageCitations)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
