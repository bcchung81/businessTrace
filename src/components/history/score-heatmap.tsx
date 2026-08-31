"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pager, paginate } from "@/components/ui/pager";
import { LIVE_PERIOD, rampFor, type HeatCell, type HeatRow } from "@/lib/services/scoreHeatmap";
import { periodLabel } from "@/lib/services/periods";

const RAMP = ["#eaf1ff", "#d7e3ff", "#a9c4ff", "#6d97ff", "#2b6bff"];

function labelOf(period: string) {
  return period === LIVE_PERIOD ? "실시간" : periodLabel(period);
}

/**
 * 기업×기간 총점 히트맵 — 한 색조의 진하기로 추이를 읽고, 셀을 누르면 그 기간의 확정 상세가 열린다.
 * 미확정 칸은 빗금으로 정직하게 남긴다.
 */
export function ScoreHeatmap({ periods, rows }: { periods: string[]; rows: HeatRow[] }) {
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<{ companyName: string; cell: NonNullable<HeatCell> } | null>(null);

  if (periods.length === 0) {
    return (
      <p className="border border-dashed border-hairline p-6 text-center text-[13px] text-muted-foreground">
        확정 기록이 없습니다. 랭킹 화면에서 시상 확정을 저장하면 기간별 총점이 쌓입니다.
      </p>
    );
  }

  const { slice, pages, current } = paginate(rows, page);
  return (
    <div className="flex flex-col gap-2 overflow-x-auto">
      <table className="w-auto border-collapse text-[12px]">
        <thead>
          <tr className="border-b-2 border-ink text-left">
            <th className="py-1.5 pr-3 font-semibold">기업</th>
            {periods.map((period) => (
              <th key={period} className="px-1 py-1.5 text-center font-mono text-[10.5px] font-semibold text-muted-foreground">
                {labelOf(period)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slice.map((row) => (
            <tr key={row.companyId} className="border-b border-hairline">
              <td className="whitespace-nowrap py-1 pr-3 font-semibold">{row.companyName}</td>
              {row.cells.map((cell, index) => (
                <td key={periods[index]} className="p-0">
                  {cell === null ? (
                    <div className="hatch m-[1px] flex h-[30px] w-[88px] items-center justify-center text-[11px] text-muted-foreground">—</div>
                  ) : (
                    <button
                      type="button"
                      aria-label={`${row.companyName} ${labelOf(cell.period)} 총점 ${cell.total.toFixed(2)} 상세`}
                      onClick={() => setOpen({ companyName: row.companyName, cell })}
                      style={{ background: rampFor(cell.total), color: cell.total >= 0.5 ? "#ffffff" : "#0b1220" }}
                      className="m-[1px] flex h-[30px] w-[88px] items-center justify-center font-mono text-[11px] font-semibold tabular-nums hover:outline hover:outline-2 hover:outline-ink"
                    >
                      {cell.total.toFixed(2)}
                    </button>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-2 text-[10.5px] text-muted-foreground">
        <span>총점</span>
        <span className="flex">
          {RAMP.map((color) => (
            <span key={color} className="h-2.5 w-6" style={{ background: color }} />
          ))}
        </span>
        <span className="font-mono">0.2 → 0.7</span>
        <span className="ml-3">빗금 = 미확정</span>
      </div>
      <Pager current={current} pages={pages} onPage={setPage} />

      <Dialog open={open !== null} onOpenChange={(next) => (next ? null : setOpen(null))}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{open ? `${open.companyName} · ${labelOf(open.cell.period)}` : ""}</DialogTitle>
          </DialogHeader>
          {open ? (
            <dl className="grid grid-cols-3 gap-3 text-[13px]">
              <div className="flex flex-col gap-1 border-t-2 border-ink pt-2">
                <dt className="text-[10.5px] font-bold tracking-[0.06em] text-muted-foreground">총점</dt>
                <dd className="font-mono text-[20px] font-bold tabular-nums">{open.cell.total.toFixed(2)}</dd>
              </div>
              <div className="flex flex-col gap-1 border-t-2 border-ink pt-2">
                <dt className="text-[10.5px] font-bold tracking-[0.06em] text-muted-foreground">순위</dt>
                <dd className="font-mono text-[20px] font-bold tabular-nums">{open.cell.rank === null ? "—" : `${open.cell.rank}위`}</dd>
              </div>
              <div className="flex flex-col gap-1 border-t-2 border-ink pt-2">
                <dt className="text-[10.5px] font-bold tracking-[0.06em] text-muted-foreground">등급</dt>
                <dd className="font-display text-[18px] font-black">{open.cell.grade}</dd>
              </div>
              {open.cell.period === LIVE_PERIOD ? (
                <p className="col-span-3 m-0 text-[11.5px] text-muted-foreground">실시간 — 아직 확정되지 않은 현재 랭킹 값이다.</p>
              ) : null}
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
