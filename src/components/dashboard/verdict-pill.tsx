import type { Verdict } from "@/lib/services/verdictRollup";

export const VERDICT_LABEL: Record<Verdict, string> = {
  verified: "통과",
  review: "검토",
  risk: "리스크",
  pending: "미분석",
};

const VERDICT_CLASS: Record<Verdict, string> = {
  verified: "bg-verified-surface text-verified",
  review: "bg-review-surface text-review",
  risk: "bg-risk-surface text-risk",
  pending: "bg-pending-surface text-pending",
};

function Icon({ verdict }: { verdict: Verdict }) {
  const common = { viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: 1.6, "aria-hidden": true, className: "h-3 w-3" };
  switch (verdict) {
    case "verified":
      return <svg {...common} strokeWidth={1.8}><path d="M2.5 6.5 5 9l4.5-6" /></svg>;
    case "review":
      return <svg {...common}><circle cx="6" cy="6" r="4.5" /><path d="M6 3.5v3l2 1" /></svg>;
    case "risk":
      return <svg {...common}><path d="M6 1.5 11 10.5H1z" /><path d="M6 5v2.5" /></svg>;
    default:
      return <svg {...common}><circle cx="6" cy="6" r="4.5" strokeDasharray="2 2" /></svg>;
  }
}

/**
 * 판정을 아이콘+글자로 찍는다. 색은 보조다.
 * 색만으로는 색각 이상과 흑백 인쇄에서 통과와 리스크가 갈리지 않는다.
 */
export function VerdictPill({ verdict, className = "" }: { verdict: Verdict; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-none py-[2px] pl-1.5 pr-2 text-[11px] font-bold ${VERDICT_CLASS[verdict]} ${className}`}
    >
      <Icon verdict={verdict} />
      {VERDICT_LABEL[verdict]}
    </span>
  );
}
