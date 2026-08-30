import type { EventRow } from "@/lib/repositories/eventRepository";
import type { EventKind } from "@/lib/services/eventRules";

export type PivotCell = { ym: string; total: number; byKind: Partial<Record<EventKind, number>> };
export type PivotRow = { companyId: number; companyName: string; total: number; cells: PivotCell[] };

/**
 * 사건 목록을 기업×월×종류 집계로 편다. 12칸이 고정이라 화면이 달마다 흔들리지 않는다.
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
      cells: months.map((ym): PivotCell => ({ ym, total: 0, byKind: {} })),
    };
    const cell = row.cells[occurred.getUTCMonth()];
    cell.total += 1;
    cell.byKind[event.kind] = (cell.byKind[event.kind] ?? 0) + 1;
    row.total += 1;
    byCompany.set(event.companyId, row);
  }

  return { months, rows: [...byCompany.values()].sort((a, b) => b.total - a.total || a.companyName.localeCompare(b.companyName, "ko")) };
}
