import type { EventRow } from "@/lib/repositories/eventRepository";
import type { EventKind, Evidence, Severity } from "@/lib/services/eventRules";

export type PivotCellEvent = { id: number; occurredAt: string; kind: EventKind; severity: Severity; title: string; evidence: Evidence[] };
export type PivotCell = { ym: string; total: number; byKind: Partial<Record<EventKind, number>>; events: PivotCellEvent[] };
export type PivotRow = { companyId: number; companyName: string; total: number; cells: PivotCell[] };

/**
 * 사건 목록을 기업×월×종류 집계로 편다. 12칸이 고정이라 화면이 달마다 흔들리지 않는다.
 * 칸마다 원본 사건을 함께 담는다 — 건수를 누르면 근거 기사까지 열리게 하기 위해서다.
 */
export function pivotEvents(events: EventRow[], year: number): { months: string[]; rows: PivotRow[] } {
  const months = Array.from({ length: 12 }, (_, index) => `${year}${String(index + 1).padStart(2, "0")}`);
  const byCompany = new Map<number, PivotRow>();

  for (const event of events) {
    const occurred = new Date(event.occurredAt);
    if (occurred.getUTCFullYear() !== year) continue;
    const row = byCompany.get(event.companyId) ?? {
      companyId: event.companyId,
      companyName: event.companyName,
      total: 0,
      cells: months.map((ym): PivotCell => ({ ym, total: 0, byKind: {}, events: [] })),
    };
    const cell = row.cells[occurred.getUTCMonth()];
    cell.total += 1;
    cell.byKind[event.kind] = (cell.byKind[event.kind] ?? 0) + 1;
    cell.events.push({ id: event.id, occurredAt: event.occurredAt, kind: event.kind, severity: event.severity, title: event.title, evidence: event.evidence });
    row.total += 1;
    byCompany.set(event.companyId, row);
  }

  for (const row of byCompany.values()) {
    for (const cell of row.cells) cell.events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  return { months, rows: [...byCompany.values()].sort((a, b) => b.total - a.total || a.companyName.localeCompare(b.companyName, "ko")) };
}
