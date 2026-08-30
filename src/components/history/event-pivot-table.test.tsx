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

  it("explains an empty year instead of an empty table", () => {
    render(<EventPivotTable months={[]} rows={[]} />);

    expect(screen.getByText(/사건이 없습니다/)).toBeInTheDocument();
  });
});
