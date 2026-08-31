import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EventPivotTable } from "@/components/history/event-pivot-table";

describe("EventPivotTable", () => {
  it("renders a company row with monthly counts", () => {
    render(
      <EventPivotTable
        months={Array.from({ length: 12 }, (_, index) => `2026${String(index + 1).padStart(2, "0")}`)}
        rows={[
          {
            companyId: 1,
            companyName: "가",
            total: 3,
            cells: Array.from({ length: 12 }, (_, index) => ({
              ym: `2026${String(index + 1).padStart(2, "0")}`,
              total: index === 2 ? 3 : 0,
              byKind: index === 2 ? { award: 3 } : {},
            })),
          },
        ]}
      />,
    );

    expect(screen.getByText("가")).toBeInTheDocument();
    expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(2);
  });

  it("explains the numbers, names kinds in Korean and sizes itself to the data", () => {
    render(
      <EventPivotTable
        months={Array.from({ length: 12 }, (_, index) => `2026${String(index + 1).padStart(2, "0")}`)}
        rows={[
          {
            companyId: 1,
            companyName: "가",
            total: 3,
            cells: Array.from({ length: 12 }, (_, index) => ({
              ym: `2026${String(index + 1).padStart(2, "0")}`,
              total: index === 2 ? 3 : 0,
              byKind: index === 2 ? { award: 2, closure: 1 } : {},
            })),
          },
        ]}
      />,
    );

    expect(screen.getByText(/칸의 숫자는 그 달의 사건 수/)).toBeInTheDocument();
    expect(screen.getByTitle("수상 2 · 휴·폐업 1")).toBeInTheDocument();
    expect(screen.getByText("수상 2 · 휴·폐업 1")).toBeInTheDocument();
    expect(screen.getByRole("table").className).toContain("w-auto");
  });

  it("pages twenty company rows at a time", () => {
    const months = Array.from({ length: 12 }, (_, index) => `2026${String(index + 1).padStart(2, "0")}`);
    const rows = Array.from({ length: 25 }, (_, index) => ({
      companyId: index + 1,
      companyName: `기업${index + 1}`,
      total: 1,
      cells: months.map((ym, m) => ({ ym, total: m === 0 ? 1 : 0, byKind: m === 0 ? { award: 1 } : {} })),
    }));
    const { container } = render(<EventPivotTable months={months} rows={rows} />);

    expect(container.querySelectorAll("tbody tr")).toHaveLength(20);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("explains an empty year instead of an empty table", () => {
    render(<EventPivotTable months={[]} rows={[]} />);

    expect(screen.getByText(/사건이 없습니다/)).toBeInTheDocument();
  });
});
