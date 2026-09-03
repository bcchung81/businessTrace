import Link from "next/link";
import { DownloadLink } from "@/components/ui/download-link";
import type { HeaderToolsData, MonthRef } from "@/lib/services/headerTools";

const CONTROL = "flex h-7 items-center justify-center px-3 text-[12px] font-bold";

/**
 * 헤더 오른쪽의 공통 도구 — 월간 문서 내려받기와 미분석 기업 일괄 실행. 미분석이 없으면 실행 버튼을 두지 않는다.
 */
export function HeaderTools({ tools }: { tools: HeaderToolsData }) {
  const { year, thisMonth, lastMonth, pendingIds } = tools;
  const monthly = (ref: MonthRef) => `/api/reports/monthly?cohort=${year}&year=${ref.year}&month=${ref.month}`;

  return (
    <div className="flex items-center gap-2">
      <details className="group relative">
        <summary className={`${CONTROL} cursor-pointer select-none list-none border border-band-foreground/40 text-band-foreground`}>월간 문서 ▾</summary>
        <div className="absolute right-0 top-full z-20 mt-1 flex min-w-36 flex-col overflow-hidden border border-band-foreground/40 bg-band text-band-foreground">
          <DownloadLink href={monthly(thisMonth)} className="w-full px-3.5 py-2 text-left text-[12px] hover:bg-band-foreground/10">
            이번 달
          </DownloadLink>
          <DownloadLink href={monthly(lastMonth)} className="w-full px-3.5 py-2 text-left text-[12px] hover:bg-band-foreground/10">
            지난 달
          </DownloadLink>
        </div>
      </details>
      {pendingIds.length > 0 ? (
        <Link
          href={`/companies?year=${year}&run=${pendingIds.join(",")}&stage=full#batch`}
          className={`${CONTROL} border border-primary bg-primary text-primary-foreground hover:bg-primary/90`}
        >
          미분석 {pendingIds.length}개사 실행
        </Link>
      ) : null}
    </div>
  );
}
