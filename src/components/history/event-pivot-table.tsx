import type { PivotRow } from "@/lib/services/eventPivot";
import { KIND_LABEL, type EventKind } from "@/lib/services/eventRules";

function kindSummary(byKind: Partial<Record<EventKind, number>>) {
  return Object.entries(byKind)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
    .map(([kind, count]) => `${KIND_LABEL[kind as EventKind] ?? kind} ${count}`)
    .join(" · ");
}

function rowSummary(row: PivotRow) {
  const totals: Partial<Record<EventKind, number>> = {};
  for (const cell of row.cells) {
    for (const [kind, count] of Object.entries(cell.byKind)) {
      totals[kind as EventKind] = (totals[kind as EventKind] ?? 0) + (count ?? 0);
    }
  }
  return kindSummary(totals);
}

/**
 * 기업×월 사건 수 피벗 — 표 폭은 데이터에 맞추고, 종류는 한국어 요약 열과 셀 title 로 읽게 한다.
 * 0 은 비워 숫자만 스캔되게 한다.
 */
export function EventPivotTable({ months, rows }: { months: string[]; rows: PivotRow[] }) {
  if (rows.length === 0) {
    return <p className="border border-dashed border-hairline p-6 text-center text-[13px] text-muted-foreground">이 연도의 사건이 없습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-2 overflow-x-auto">
      <p className="text-[11px] text-muted-foreground">
        칸의 숫자는 그 달의 사건 수 — 종류별 내역은 오른쪽 요약과 셀에 마우스를 올리면 나온다.
      </p>
      <table className="w-auto border-collapse text-[12px]">
        <thead>
          <tr className="border-b-2 border-ink text-left">
            <th className="py-1.5 pr-3 font-semibold">기업</th>
            {months.map((ym) => (
              <th key={ym} className="w-8 px-1 py-1.5 text-right font-mono text-[10.5px] text-muted-foreground">
                {Number(ym.slice(4))}월
              </th>
            ))}
            <th className="py-1.5 pl-3 pr-3 text-right font-semibold">계</th>
            <th className="py-1.5 pl-1 font-semibold">종류</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.companyId} className="border-b border-hairline">
              <td className="whitespace-nowrap py-1.5 pr-3 font-semibold">{row.companyName}</td>
              {row.cells.map((cell) => (
                <td
                  key={cell.ym}
                  title={cell.total === 0 ? undefined : kindSummary(cell.byKind)}
                  className="w-8 px-1 py-1.5 text-right font-mono tabular-nums"
                >
                  {cell.total === 0 ? "" : cell.total}
                </td>
              ))}
              <td className="py-1.5 pl-3 pr-3 text-right font-mono font-bold tabular-nums">{row.total}</td>
              <td className="whitespace-nowrap py-1.5 pl-1 text-[11px] text-muted-foreground">{rowSummary(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
