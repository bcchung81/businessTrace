import Link from "next/link";
import type { RisingRow } from "@/lib/services/rising";

/**
 * 추이 상승 TOP 10 — 직전 확정 기간 대비 순위 상승 순. 시상 후보 검토의 출발점이다.
 * 상승 표시는 인원 추이와 같은 문법으로 verified 색을 쓴다.
 */
export function RisingCompanies({ rows, periodLabelText }: { rows: RisingRow[]; periodLabelText: string | null }) {
  if (rows.length === 0) {
    return (
      <p className="border border-dashed border-hairline p-6 text-center text-[13px] text-muted-foreground">
        비교할 확정 기록이 없거나 순위가 오른 기업이 없습니다. 랭킹 화면에서 시상 확정을 저장하면 실시간 순위와 그 기준을 비교합니다.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {periodLabelText ? <p className="text-[11.5px] text-muted-foreground">{periodLabelText}</p> : null}
      <ol className="flex flex-col">
        {rows.map((row, index) => (
          <li key={row.companyId} className="flex items-center gap-2.5 border-b border-hairline py-1.5 text-[12.5px] last:border-0">
            <span className="font-display w-6 text-[15px] font-black tabular-nums">{index + 1}</span>
            <Link href={`/companies/${row.companyId}`} className="min-w-0 flex-1 truncate font-semibold hover:underline">
              {row.companyName}
            </Link>
            <span className="whitespace-nowrap font-mono text-[11px] tabular-nums text-muted-foreground">
              {row.prevRank}위→{row.rank}위
            </span>
            <span className="w-9 whitespace-nowrap text-right font-mono text-[12px] font-bold tabular-nums text-verified">▲{row.delta}</span>
            <span className="w-10 text-right font-mono text-[11.5px] tabular-nums">{row.total.toFixed(2)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
