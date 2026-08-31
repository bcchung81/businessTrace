"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pager, paginate } from "@/components/ui/pager";
import type { PivotCell, PivotCellEvent, PivotRow } from "@/lib/services/eventPivot";
import { KIND_LABEL, SEVERITY_LABEL, type EventKind } from "@/lib/services/eventRules";
import { kstDate } from "@/lib/services/kst";

const SEVERITY_TONE: Record<string, string> = {
  alert: "bg-risk-surface text-risk",
  notice: "bg-review-surface text-review",
  positive: "bg-verified-surface text-verified",
  info: "bg-pending-surface text-pending",
};

const GRID_KINDS: Array<{ kind: EventKind; short: string }> = [
  { kind: "award", short: "수" },
  { kind: "investment", short: "투" },
  { kind: "positive_press", short: "긍" },
  { kind: "negative_press", short: "부" },
];

function monthLabel(ym: string) {
  return `${ym.slice(0, 4)}년 ${Number(ym.slice(4))}월`;
}

type OpenCell = { companyName: string; ym: string; kind: EventKind; count: number; events: PivotCellEvent[] };

/**
 * 사건 피벗 — 기업당 한 행, 달마다 수·투·긍·부 네 칸으로 갈라 종류별 건수를 센다.
 * 건수를 누르면 그 달·그 종류의 사건과 근거 기사가 열린다. 그 외 종류는 기업 상세의 사건 이력에서 본다.
 */
export function EventPivotTable({ months, rows }: { months: string[]; rows: PivotRow[] }) {
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<OpenCell | null>(null);
  if (rows.length === 0) {
    return <p className="border border-dashed border-hairline p-6 text-center text-[13px] text-muted-foreground">이 연도의 사건이 없습니다.</p>;
  }

  const { slice, pages, current } = paginate(rows, page);
  const countOf = (cell: PivotCell, kind: EventKind) => cell.byKind[kind] ?? 0;
  const rowTotal = (row: PivotRow) =>
    row.cells.reduce((sum, cell) => sum + GRID_KINDS.reduce((inner, entry) => inner + countOf(cell, entry.kind), 0), 0);

  return (
    <div className="flex flex-col gap-2 overflow-x-auto">
      <p className="text-[11px] text-muted-foreground">달마다 수상·투자·긍정·부정 순 네 칸 — 누르면 사건과 근거 기사가 열린다. 그 외 종류는 기업 상세의 사건 이력에.</p>
      <table className="w-auto border-collapse text-[11px]">
        <thead>
          <tr className="text-left">
            <th rowSpan={2} className="border-b-2 border-ink py-1 pr-2 align-bottom text-[12px] font-semibold">기업</th>
            {months.map((ym) => (
              <th key={ym} colSpan={4} className="border-l border-hairline px-0.5 pt-1 text-center font-mono text-[10px] font-semibold text-muted-foreground">
                {Number(ym.slice(4))}월
              </th>
            ))}
            <th rowSpan={2} className="border-b-2 border-ink py-1 pl-2 text-right align-bottom text-[12px] font-semibold">계</th>
          </tr>
          <tr className="border-b-2 border-ink text-center">
            {months.flatMap((ym) =>
              GRID_KINDS.map((entry, index) => (
                <th
                  key={`${ym}-${entry.kind}`}
                  title={KIND_LABEL[entry.kind]}
                  className={`w-[17px] pb-1 font-mono text-[9.5px] font-semibold text-muted-foreground/80 ${index === 0 ? "border-l border-hairline" : ""}`}
                >
                  {entry.short}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {slice.map((row) => (
            <tr key={row.companyId} className="border-b border-hairline">
              <td className="max-w-[92px] truncate whitespace-nowrap py-1 pr-2 text-[12px] font-semibold" title={row.companyName}>
                {row.companyName}
              </td>
              {row.cells.flatMap((cell) =>
                GRID_KINDS.map((entry, index) => {
                  const count = countOf(cell, entry.kind);
                  return (
                    <td key={`${cell.ym}-${entry.kind}`} className={`w-[17px] p-0 text-center font-mono tabular-nums ${index === 0 ? "border-l border-hairline" : ""}`}>
                      {count === 0 ? null : (
                        <button
                          type="button"
                          aria-label={`${row.companyName} ${Number(cell.ym.slice(4))}월 ${KIND_LABEL[entry.kind]} ${count}건 보기`}
                          onClick={() =>
                            setOpen({ companyName: row.companyName, ym: cell.ym, kind: entry.kind, count, events: cell.events.filter((event) => event.kind === entry.kind) })
                          }
                          className="w-full py-1 font-bold underline decoration-hairline decoration-dotted underline-offset-2 hover:bg-accent hover:decoration-primary"
                        >
                          {count}
                        </button>
                      )}
                    </td>
                  );
                }),
              )}
              <td className="py-1 pl-2 text-right font-mono text-[12px] font-bold tabular-nums">{rowTotal(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pager current={current} pages={pages} onPage={setPage} />

      <Dialog open={open !== null} onOpenChange={(next) => (next ? null : setOpen(null))}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{open ? `${open.companyName} · ${monthLabel(open.ym)} · ${KIND_LABEL[open.kind]} ${open.count}건` : ""}</DialogTitle>
          </DialogHeader>
          <ul className="flex max-h-[60vh] flex-col overflow-y-auto">
            {(open?.events ?? []).map((event) => (
              <li key={event.id} className="flex flex-col gap-1 border-b border-hairline py-2.5 last:border-0">
                <div className="flex flex-wrap items-baseline gap-2 text-[12.5px]">
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{kstDate(event.occurredAt)}</span>
                  <span className={`px-1.5 py-[1px] text-[10.5px] font-bold ${SEVERITY_TONE[event.severity] ?? SEVERITY_TONE.info}`}>
                    {SEVERITY_LABEL[event.severity] ?? event.severity}
                  </span>
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
