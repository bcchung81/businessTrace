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

const KIND_ORDER: EventKind[] = ["award", "investment", "positive_press", "negative_press", "closure", "venture_expiry", "headcount_up", "headcount_down", "source_conflict", "silence"];

function kindsOf(row: PivotRow): EventKind[] {
  const present = new Set<EventKind>();
  for (const cell of row.cells) {
    for (const kind of Object.keys(cell.byKind)) present.add(kind as EventKind);
  }
  return KIND_ORDER.filter((kind) => present.has(kind));
}

function monthLabel(ym: string) {
  return `${ym.slice(0, 4)}년 ${Number(ym.slice(4))}월`;
}

type OpenCell = { companyName: string; ym: string; kind: EventKind; count: number; events: PivotCellEvent[] };

/**
 * 사건 피벗 — 기업을 종류별 행으로 갈라 월별 수상·투자·긍정·부정 건수를 따로 센다.
 * 건수를 누르면 그 달·그 종류의 사건과 근거 기사가 열린다. 0 은 비워 스캔이 되게 한다.
 */
export function EventPivotTable({ months, rows }: { months: string[]; rows: PivotRow[] }) {
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<OpenCell | null>(null);
  if (rows.length === 0) {
    return <p className="border border-dashed border-hairline p-6 text-center text-[13px] text-muted-foreground">이 연도의 사건이 없습니다.</p>;
  }

  const { slice, pages, current } = paginate(rows, page);

  const countOf = (cell: PivotCell, kind: EventKind) => cell.byKind[kind] ?? 0;

  return (
    <div className="flex flex-col gap-2 overflow-x-auto">
      <p className="text-[11px] text-muted-foreground">칸의 숫자는 그 달·그 종류의 사건 수 — 누르면 사건과 근거 기사가 열린다.</p>
      <table className="w-auto border-collapse text-[12px]">
        <thead>
          <tr className="border-b-2 border-ink text-left">
            <th className="py-1.5 pr-3 font-semibold">기업</th>
            <th className="py-1.5 pr-3 font-semibold">종류</th>
            {months.map((ym) => (
              <th key={ym} className="w-8 px-1 py-1.5 text-right font-mono text-[10.5px] text-muted-foreground">
                {Number(ym.slice(4))}월
              </th>
            ))}
            <th className="py-1.5 pl-3 text-right font-semibold">계</th>
          </tr>
        </thead>
        <tbody>
          {slice.flatMap((row) => {
            const kinds = kindsOf(row);
            return kinds.map((kind, kindIndex) => (
              <tr key={`${row.companyId}-${kind}`} className={kindIndex === kinds.length - 1 ? "border-b border-hairline" : ""}>
                {kindIndex === 0 ? (
                  <td rowSpan={kinds.length} className="whitespace-nowrap py-1.5 pr-3 align-top font-semibold">
                    {row.companyName}
                  </td>
                ) : null}
                <td className="whitespace-nowrap py-1 pr-3 text-[11px] text-muted-foreground">{KIND_LABEL[kind]}</td>
                {row.cells.map((cell) => {
                  const count = countOf(cell, kind);
                  return (
                    <td key={cell.ym} className="w-8 px-0.5 py-0.5 text-right font-mono tabular-nums">
                      {count === 0 ? null : (
                        <button
                          type="button"
                          aria-label={`${row.companyName} ${Number(cell.ym.slice(4))}월 ${KIND_LABEL[kind]} ${count}건 보기`}
                          onClick={() =>
                            setOpen({ companyName: row.companyName, ym: cell.ym, kind, count, events: cell.events.filter((event) => event.kind === kind) })
                          }
                          className="w-full px-0.5 py-0.5 text-right font-bold underline decoration-hairline decoration-dotted underline-offset-4 hover:bg-accent hover:decoration-primary"
                        >
                          {count}
                        </button>
                      )}
                    </td>
                  );
                })}
                <td className="py-1 pl-3 text-right font-mono font-bold tabular-nums">
                  {row.cells.reduce((sum, cell) => sum + countOf(cell, kind), 0)}
                </td>
              </tr>
            ));
          })}
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
