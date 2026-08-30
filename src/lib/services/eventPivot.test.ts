import { describe, expect, it } from "vitest";
import type { EventRow } from "@/lib/repositories/eventRepository";
import { pivotEvents } from "@/lib/services/eventPivot";

function event(companyId: number, companyName: string, occurredAt: string, kind: EventRow["kind"]): EventRow {
  return { id: 0, companyId, companyName, kind, severity: "notice", occurredAt, title: "t", evidence: [], runId: null, trust: null, status: "open", note: null, reviewedAt: null };
}

describe("pivotEvents", () => {
  it("pivots events into company × month × kind counts over a fixed 12-month row", () => {
    const { months, rows } = pivotEvents(
      [
        event(1, "가", "2026-03-05T00:00:00.000Z", "award"),
        event(1, "가", "2026-03-20T00:00:00.000Z", "award"),
        event(1, "가", "2026-07-01T00:00:00.000Z", "closure"),
        event(2, "나", "2026-01-15T00:00:00.000Z", "investment"),
      ],
      2026,
    );

    expect(months).toHaveLength(12);
    expect(months[0]).toBe("202601");
    expect(rows.map((row) => row.companyName)).toEqual(["가", "나"]);
    expect(rows[0].total).toBe(3);
    expect(rows[0].cells[2]).toEqual({ ym: "202603", total: 2, byKind: { award: 2 } });
    expect(rows[0].cells[6]).toEqual({ ym: "202607", total: 1, byKind: { closure: 1 } });
  });

  it("ignores events outside the year and returns no row for silent companies", () => {
    const { rows } = pivotEvents([event(1, "가", "2025-12-31T00:00:00.000Z", "award")], 2026);

    expect(rows).toEqual([]);
  });
});
