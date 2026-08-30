import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SeverityMark, trustLabel } from "@/components/dashboard/severity-ui";
import { kstMonthDay } from "@/lib/services/kst";
import type { CompanyCardData } from "@/lib/services/companyCards";

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
  const trust = trustLabel(card.trust, { measuredLabel: null });
  const headcount = headcountLabel(card.headcount);
  const warnCount = card.events30d.notice + card.events30d.alert;
  const latest = monthDay(card.latestArticle);

  return (
    <Card variant="comic" className="gap-2.5 p-4">
      <div className="flex items-center gap-1.5 text-[12px]">
        {card.worstSeverity ? <SeverityMark severity={card.worstSeverity} /> : null}
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
