import type { PivotRow } from "@/lib/services/eventPivot";

/**
 * 기업×월 사건 수 피벗 — 숫자만 적고 0 은 비워 스캔이 되게 한다. 종류별 상세는 title 로 단다.
 */
export function EventPivotTable({ months, rows }: { months: string[]; rows: PivotRow[] }) {
  if (rows.length === 0) {
    return <p className="border border-dashed border-hairline p-6 text-center text-[13px] text-muted-foreground">이 연도의 사건이 없습니다.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b-2 border-ink text-left">
            <th className="py-1.5 pr-2 font-semibold">기업</th>
            {months.map((ym) => (
              <th key={ym} className="px-1 py-1.5 text-right font-mono text-[10.5px] text-muted-foreground">
                {ym.slice(4)}
              </th>
            ))}
            <th className="py-1.5 pl-2 text-right font-semibold">계</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.companyId} className="border-b border-hairline">
              <td className="whitespace-nowrap py-1.5 pr-2 font-semibold">{row.companyName}</td>
              {row.cells.map((cell) => (
                <td
                  key={cell.ym}
                  title={Object.entries(cell.byKind)
                    .map(([kind, count]) => `${kind} ${count}`)
                    .join(" · ")}
                  className="px-1 py-1.5 text-right font-mono tabular-nums"
                >
                  {cell.total === 0 ? "" : cell.total}
                </td>
              ))}
              <td className="py-1.5 pl-2 text-right font-mono font-bold tabular-nums">{row.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
