import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SeverityMark, trustLabel } from "@/components/dashboard/severity-ui";
import { kstDateShort } from "@/lib/services/kst";
import { isStale } from "@/lib/services/newsCoverage";
import { SeverityIcon } from "@/components/dashboard/severity-ui";
import type { CompanyCardData } from "@/lib/services/companyCards";

export const COMPANY_COLUMNS = ["심각도", "기업", "신뢰", "업종", "가입자", "수상·투자·긍정", "주의", "최근 보도", "미확인"] as const;
export const COLUMN_HINT: Partial<Record<(typeof COMPANY_COLUMNS)[number], string>> = {
  "신뢰": "최신 분석의 검증 판정",
  "가입자": "국민연금 가입자 수 · 12개월 증감",
  "수상·투자·긍정": "지난 30일 긍정 사건 수",
  "주의": "지난 30일 주의·경보 사건 수",
  "미확인": "확인하지 않은 경보·주의 사건 수",
};

function deltaLabel(delta: number | null) {
  if (delta === null) return null;
  return `${delta >= 0 ? "▲" : "▼"}${Math.round(Math.abs(delta) * 100)}%`;
}

/**
 * 기업 한 곳이 표 한 행이다 — 카드에 있던 필드를 열로 편다. 0 은 0 으로 남기고 빈칸은 "—" 다.
 */
export function CompanyRow({ card, now = new Date() }: { card: CompanyCardData; now?: Date }) {
  const trust = trustLabel(card.trust, { measuredLabel: null });
  const stale = card.latestArticle !== null && isStale(card.latestArticle, now);
  const warn = card.events30d.notice + card.events30d.alert;
  const delta = deltaLabel(card.headcount.delta12m);

  return (
    <tr className="border-b border-hairline align-middle last:border-0">
      <td className="whitespace-nowrap px-2 py-1.5">
        {card.worstSeverity ? (
          <SeverityMark severity={card.worstSeverity} />
        ) : (
          <span className="flex items-center gap-1 font-semibold text-muted-foreground">
            <SeverityIcon severity="info" />
            {card.everHadEvents ? "무보도" : "사건 없음"}
          </span>
        )}
      </td>
      <td className="px-2 py-1.5">
        <div className="flex flex-col gap-0.5">
          <Link href={`/companies/${card.id}`} className="font-semibold underline-offset-2 hover:underline">
            {card.name}
          </Link>
          {card.businessNo ? null : <span className="text-[11px] font-semibold text-review">사업자번호 미확보</span>}
        </div>
      </td>
      <td className="whitespace-nowrap px-2 py-1.5">{trust ? <Badge variant="signal">{trust}</Badge> : <span className="text-muted-foreground/45">—</span>}</td>
      <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">{card.industry ?? "미분류"}</td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono tabular-nums">
        {card.headcount.latest === null ? <span className="text-muted-foreground">미확보</span> : card.headcount.latest}
        {delta ? <span className="ml-1 text-[11px] text-muted-foreground">{delta}</span> : null}
      </td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{card.events30d.positive}</td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{warn}</td>
      <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
        {card.latestArticle ? (
          <span className={stale ? "hatch px-1" : undefined}>{kstDateShort(card.latestArticle, now)}{stale ? " · 낡음" : ""}</span>
        ) : (
          "없음"
        )}
      </td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{card.open}</td>
    </tr>
  );
}
