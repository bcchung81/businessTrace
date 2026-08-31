import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { EventPivotTable } from "@/components/history/event-pivot-table";
import type { PivotCell } from "@/lib/services/eventPivot";

const MONTHS = Array.from({ length: 12 }, (_, index) => `2026${String(index + 1).padStart(2, "0")}`);

function cells(over: Record<number, Partial<Pick<PivotCell, "total" | "byKind" | "events">>>): PivotCell[] {
  return MONTHS.map((ym, index) => {
    const cell = over[index];
    return { ym, total: cell?.total ?? 0, byKind: cell?.byKind ?? {}, events: cell?.events ?? [] };
  });
}

describe("EventPivotTable", () => {
  it("keeps one row per company and splits each month into 수·투·긍·부 sub-columns", () => {
    render(
      <EventPivotTable
        months={MONTHS}
        rows={[
          {
            companyId: 1,
            companyName: "에이트테크",
            total: 3,
            cells: cells({
              2: {
                total: 3,
                byKind: { award: 2, positive_press: 1 },
                events: [
                  { id: 11, occurredAt: "2026-03-05T00:00:00.000Z", kind: "award", severity: "positive", title: "수상 — 대상", evidence: [{ label: "대상", link: "https://n/1" }] },
                  { id: 12, occurredAt: "2026-03-06T00:00:00.000Z", kind: "award", severity: "positive", title: "수상 — 혁신상", evidence: [] },
                  { id: 13, occurredAt: "2026-03-20T00:00:00.000Z", kind: "positive_press", severity: "positive", title: "긍정 보도 — 매출 급증", evidence: [] },
                ],
              },
            }),
          },
        ]}
      />,
    );

    const monthHeader = screen.getByRole("columnheader", { name: "3월" });
    expect(monthHeader).toHaveAttribute("colspan", "4");
    expect(screen.getAllByRole("columnheader", { name: "수" })).toHaveLength(12);
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "에이트테크 3월 수상 2건 보기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "에이트테크 3월 긍정 보도 1건 보기" })).toBeInTheDocument();
    const name = screen.getByText("에이트테크");
    expect(name.className).toContain("truncate");
  });

  it("opens a popup with only that kind's events for the month", () => {
    render(
      <EventPivotTable
        months={MONTHS}
        rows={[
          {
            companyId: 1,
            companyName: "가",
            total: 2,
            cells: cells({
              2: {
                total: 2,
                byKind: { award: 1, positive_press: 1 },
                events: [
                  { id: 11, occurredAt: "2026-03-05T00:00:00.000Z", kind: "award", severity: "positive", title: "수상 — CES 혁신상", evidence: [{ label: "CES 혁신상", link: "https://n/1" }] },
                  { id: 12, occurredAt: "2026-03-20T00:00:00.000Z", kind: "positive_press", severity: "positive", title: "긍정 보도 — 매출 급증", evidence: [] },
                ],
              },
            }),
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "가 3월 수상 1건 보기" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("가 · 2026년 3월 · 수상 1건")).toBeInTheDocument();
    expect(within(dialog).getByText("수상 — CES 혁신상")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "CES 혁신상" })).toHaveAttribute("href", "https://n/1");
    expect(within(dialog).queryByText("긍정 보도 — 매출 급증")).not.toBeInTheDocument();
  });

  it("pages twenty companies at a time", () => {
    const rows = Array.from({ length: 25 }, (_, index) => ({
      companyId: index + 1,
      companyName: `기업${index + 1}`,
      total: 2,
      cells: cells({ 0: { total: 2, byKind: { award: 1, investment: 1 }, events: [] } }),
    }));
    const { container } = render(<EventPivotTable months={MONTHS} rows={rows} />);

    expect(container.querySelectorAll("tbody tr")).toHaveLength(20);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("explains an empty year instead of an empty table", () => {
    render(<EventPivotTable months={[]} rows={[]} />);

    expect(screen.getByText(/사건이 없습니다/)).toBeInTheDocument();
  });
});
