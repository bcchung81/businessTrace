import { DownloadLink } from "@/components/ui/download-link";

/**
 * 월간 문서 다운로드 목록 — 코호트 연도의 1월부터 지금 달까지, 생성은 기존 라우트가 한다.
 */
export function MonthlyDocList({ cohortYear, year, month }: { cohortYear: number; year: number; month: number }) {
  const items: Array<{ year: number; month: number }> = [];
  for (let m = month; m >= 1; m -= 1) items.push({ year, month: m });

  return (
    <ul className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <li key={`${item.year}-${item.month}`}>
          <DownloadLink
            href={`/api/reports/monthly?cohort=${cohortYear}&year=${item.year}&month=${item.month}`}
            className="flex w-full items-baseline justify-between gap-2 border-[1.5px] border-hairline px-3 py-2 text-[12.5px] font-bold hover:bg-secondary"
          >
            <span>
              {item.year}년 {item.month}월
            </span>
            <span className="font-mono text-[10.5px] font-semibold text-muted-foreground">xlsx</span>
          </DownloadLink>
        </li>
      ))}
    </ul>
  );
}
