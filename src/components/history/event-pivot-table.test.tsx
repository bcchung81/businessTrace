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
  it("renders a company row with monthly counts", () => {
    render(
      <EventPivotTable
        months={MONTHS}
        rows={[{ companyId: 1, companyName: "가", total: 3, cells: cells({ 2: { total: 3, byKind: { award: 3 }, events: [] } }) }]}
      />,
    );

    expect(screen.getByText("가")).toBeInTheDocument();
    expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(2);
  });

  it("opens a popup with the cell's events and their article links on click", () => {
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
                  { id: 12, occurredAt: "2026-03-20T00:00:00.000Z", kind: "positive_press", severity: "positive", title: "긍정 보도 — 매출 급증", evidence: [{ label: "매출 급증" }] },
                ],
              },
            }),
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "가 3월 사건 2건 보기" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("가 · 2026년 3월 · 사건 2건")).toBeInTheDocument();
    expect(within(dialog).getByText("수상 — CES 혁신상")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "CES 혁신상" })).toHaveAttribute("href", "https://n/1");
    expect(within(dialog).getByText("긍정 보도 — 매출 급증")).toBeInTheDocument();
  });

  it("leaves empty cells unclickable", () => {
    render(
      <EventPivotTable
        months={MONTHS}
        rows={[{ companyId: 1, companyName: "가", total: 1, cells: cells({ 0: { total: 1, byKind: { award: 1 }, events: [] } }) }]}
      />,
    );

    expect(screen.getAllByRole("button", { name: /사건 \d+건 보기/ })).toHaveLength(1);
  });

  it("explains the numbers, names kinds in Korean and sizes itself to the data", () => {
    render(
      <EventPivotTable
        months={MONTHS}
        rows={[{ companyId: 1, companyName: "가", total: 3, cells: cells({ 2: { total: 3, byKind: { award: 2, closure: 1 }, events: [] } }) }]}
      />,
    );

    expect(screen.getByText(/칸의 숫자는 그 달의 사건 수/)).toBeInTheDocument();
    expect(screen.getByTitle("수상 2 · 휴·폐업 1")).toBeInTheDocument();
    expect(screen.getByText("수상 2 · 휴·폐업 1")).toBeInTheDocument();
    expect(screen.getByRole("table").className).toContain("w-auto");
  });

  it("pages twenty company rows at a time", () => {
    const rows = Array.from({ length: 25 }, (_, index) => ({
      companyId: index + 1,
      companyName: `기업${index + 1}`,
      total: 1,
      cells: cells({ 0: { total: 1, byKind: { award: 1 }, events: [] } }),
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
