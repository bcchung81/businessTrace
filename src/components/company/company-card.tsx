import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SEVERITY_LABEL, type Severity, type Trust } from "@/lib/services/eventRules";
import { kstMonthDay } from "@/lib/services/kst";
import type { CompanyCardData } from "@/lib/services/companyCards";

const SEVERITY_CLASS: Record<Severity, string> = {
  alert: "text-risk",
  notice: "text-review",
  positive: "text-verified",
  info: "text-muted-foreground",
};

function SeverityIcon({ severity }: { severity: Severity }) {
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

function trustLabel(trust: Trust) {
  if (trust === "verified") return "근거 확인";
  if (trust === "needs_review") return "확인 필요";
  return null;
}

function headcountLabel(headcount: CompanyCardData["headcount"]) {
  if (headcount.latest === null) return { count: "가입자 미확보", delta: null };
  const delta = headcount.delta12m;
  if (delta === null) return { count: `가입자 ${headcount.latest}명`, delta: null };
  const arrow = delta >= 0 ? "▲" : "▼";
  const pct = Math.round(Math.abs(delta) * 100);
  return { count: `가입자 ${headcount.latest}명`, delta: `${arrow}${pct}%` };
}

function monthDay(iso: string | null) {
  return iso ? kstMonthDay(iso) : null;
}

/**
 * 기업 카드 한 장 — 심각도·신뢰도·인원 추이·최근 사건·최근 보도를 한눈에 준다.
 */
export function CompanyCard({ card }: { card: CompanyCardData }) {
  const trust = trustLabel(card.trust);
  const headcount = headcountLabel(card.headcount);
  const warnCount = card.events30d.notice + card.events30d.alert;
  const latest = monthDay(card.latestArticle);

  return (
    <Card variant="comic" className="gap-2.5 p-4">
      <div className="flex items-center gap-1.5 text-[12px]">
        {card.worstSeverity ? (
          <span className={`flex items-center gap-1 font-semibold ${SEVERITY_CLASS[card.worstSeverity]}`}>
            <SeverityIcon severity={card.worstSeverity} />
            {SEVERITY_LABEL[card.worstSeverity]}
          </span>
        ) : null}
        <Link href={`/companies/${card.id}`} className="flex-1 truncate font-semibold underline-offset-2 hover:underline">
          {card.name}
        </Link>
        {trust ? <Badge variant="ink">{trust}</Badge> : null}
      </div>

      <p className="text-[12px] text-muted-foreground">
        {card.industry ?? "미분류"}
        <span> · </span>
        <span>{headcount.count}</span>
        {headcount.delta ? <span className="ml-1 font-mono tabular-nums">{headcount.delta}</span> : null}
      </p>

      <p className="text-[12px] text-muted-foreground">
        ★ 수상·투자·긍정 {card.events30d.positive} · ▲ 주의 {warnCount}
      </p>

      <p className="text-[11.5px] text-muted-foreground">{latest ? `최근 보도 ${latest}` : "최근 보도 없음"}</p>

      {card.businessNo ? null : <p className="text-[11.5px] font-medium text-review">사업자번호 미확보</p>}

      {card.open > 0 ? (
        <Badge variant="ink" className="self-start">
          {`미확인 ${card.open}`}
        </Badge>
      ) : null}
    </Card>
  );
}
