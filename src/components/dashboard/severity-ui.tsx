import { SEVERITY_LABEL, type Severity, type Trust } from "@/lib/services/eventRules";

export const SEVERITY_CLASS: Record<Severity, string> = {
  alert: "text-risk",
  notice: "text-review",
  positive: "text-verified",
  info: "text-muted-foreground",
};

/**
 * 심각도를 나타내는 작은 아이콘.
 */
export function SeverityIcon({ severity }: { severity: Severity }) {
  const common = { viewBox: "0 0 12 12", fill: "none" as const, stroke: "currentColor", strokeWidth: 1.6, "aria-hidden": true, className: "h-3 w-3 flex-none" };
  switch (severity) {
    case "alert":
      return <svg {...common}><path d="M6 1.5 11 10.5H1z" /><path d="M6 5v2.5" /></svg>;
    case "notice":
      return <svg {...common}><circle cx="6" cy="6" r="4.5" /><path d="M6 3.5v3l2 1" /></svg>;
    case "positive":
      return <svg {...common} strokeWidth={1.8}><path d="M2.5 6.5 5 9l4.5-6" /></svg>;
    default:
      return <svg {...common}><circle cx="6" cy="6" r="4.5" strokeDasharray="2 2" /></svg>;
  }
}

/**
 * 아이콘과 심각도 이름표를 함께 낸다.
 */
export function SeverityMark({ severity }: { severity: Severity }) {
  return (
    <span className={`flex items-center gap-1 font-semibold ${SEVERITY_CLASS[severity]}`}>
      <SeverityIcon severity={severity} />
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

/**
 * 신뢰 배지 문구를 낸다 — LLM 검증을 거친 사건만 근거 확인/확인 필요로 나뉜다.
 * 검증을 거치지 않은 실측값은 `measuredLabel`(기본 "실측")이고, `null` 을 주면 아예 내지 않는다.
 */
export function trustLabel(trust: Trust, options: { measuredLabel?: string | null } = {}): string | null {
  const { measuredLabel = "실측" } = options;
  if (trust === "verified") return "근거 확인";
  if (trust === "needs_review") return "확인 필요";
  return measuredLabel;
}
