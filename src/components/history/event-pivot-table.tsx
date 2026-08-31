"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pager, paginate } from "@/components/ui/pager";
import type { PivotCell, PivotRow } from "@/lib/services/eventPivot";
import { KIND_LABEL, SEVERITY_LABEL, type EventKind } from "@/lib/services/eventRules";
import { kstDate } from "@/lib/services/kst";

const SEVERITY_TONE: Record<string, string> = {
  alert: "bg-risk-surface text-risk",
  notice: "bg-review-surface text-review",
  positive: "bg-verified-surface text-verified",
  info: "bg-pending-surface text-pending",
};

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

function monthLabel(ym: string) {
  return `${ym.slice(0, 4)}년 ${Number(ym.slice(4))}월`;
}

/**
 * 기업×월 사건 수 피벗 — 건수를 누르면 그 달의 사건과 근거 기사가 팝업으로 열린다.
 * 표 폭은 데이터에 맞추고, 0 은 비워 숫자만 스캔되게 한다.
 */
export function EventPivotTable({ months, rows }: { months: string[]; rows: PivotRow[] }) {
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<{ companyName: string; cell: PivotCell } | null>(null);
  if (rows.length === 0) {
    return <p className="border border-dashed border-hairline p-6 text-center text-[13px] text-muted-foreground">이 연도의 사건이 없습니다.</p>;
  }

  const { slice, pages, current } = paginate(rows, page);
  return (
    <div className="flex flex-col gap-2 overflow-x-auto">
      <p className="text-[11px] text-muted-foreground">칸의 숫자는 그 달의 사건 수 — 누르면 사건과 근거 기사가 열린다.</p>
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
          {slice.map((row) => (
            <tr key={row.companyId} className="border-b border-hairline">
              <td className="whitespace-nowrap py-1.5 pr-3 font-semibold">{row.companyName}</td>
              {row.cells.map((cell) => (
                <td key={cell.ym} className="w-8 px-0.5 py-1 text-right font-mono tabular-nums">
                  {cell.total === 0 ? null : (
                    <button
                      type="button"
                      aria-label={`${row.companyName} ${Number(cell.ym.slice(4))}월 사건 ${cell.total}건 보기`}
                      title={kindSummary(cell.byKind)}
                      onClick={() => setOpen({ companyName: row.companyName, cell })}
                      className="w-full px-0.5 py-0.5 text-right font-bold underline decoration-hairline decoration-dotted underline-offset-4 hover:bg-accent hover:decoration-primary"
                    >
                      {cell.total}
                    </button>
                  )}
                </td>
              ))}
              <td className="py-1.5 pl-3 pr-3 text-right font-mono font-bold tabular-nums">{row.total}</td>
              <td className="whitespace-nowrap py-1.5 pl-1 text-[11px] text-muted-foreground">{rowSummary(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pager current={current} pages={pages} onPage={setPage} />

      <Dialog open={open !== null} onOpenChange={(next) => (next ? null : setOpen(null))}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {open ? `${open.companyName} · ${monthLabel(open.cell.ym)} · 사건 ${open.cell.total}건` : ""}
            </DialogTitle>
          </DialogHeader>
          <ul className="flex max-h-[60vh] flex-col overflow-y-auto">
            {(open?.cell.events ?? []).map((event) => (
              <li key={event.id} className="flex flex-col gap-1 border-b border-hairline py-2.5 last:border-0">
                <div className="flex flex-wrap items-baseline gap-2 text-[12.5px]">
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{kstDate(event.occurredAt)}</span>
                  <span className={`px-1.5 py-[1px] text-[10.5px] font-bold ${SEVERITY_TONE[event.severity] ?? SEVERITY_TONE.info}`}>
                    {SEVERITY_LABEL[event.severity] ?? event.severity}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{KIND_LABEL[event.kind] ?? event.kind}</span>
                </div>
                <p className="m-0 text-[13px] font-medium">{event.title}</p>
                {event.evidence.filter((item) => item.link).length > 0 ? (
                  <ul className="flex flex-col gap-0.5">
                    {event.evidence
                      .filter((item) => item.link)
                      .map((item) => (
                        <li key={item.link}>
                          <a href={item.link} target="_blank" rel="noreferrer" className="text-[12px] underline decoration-dotted underline-offset-2 hover:text-primary">
                            {item.label}
                          </a>
                        </li>
                      ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
