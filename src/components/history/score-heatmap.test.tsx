import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ScoreHeatmap } from "@/components/history/score-heatmap";
import { LIVE_PERIOD } from "@/lib/services/scoreHeatmap";

const PERIODS = ["2025", LIVE_PERIOD];

function row(companyId: number, name: string, confirmed: number | null, live: number) {
  return {
    companyId,
    companyName: name,
    cells: [
      confirmed === null ? null : { period: "2025", total: confirmed, rank: 3, grade: "우수" },
      { period: LIVE_PERIOD, total: live, rank: 2, grade: "우수" },
    ],
  };
}

describe("ScoreHeatmap", () => {
  it("renders period columns, shaded score cells and a hatch for missing periods", () => {
    render(<ScoreHeatmap periods={PERIODS} rows={[row(1, "엘리스그룹", 0.63, 0.64), row(2, "신규기업", null, 0.5)]} />);

    expect(screen.getByText("2025년")).toBeInTheDocument();
    expect(screen.getByText("실시간")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "엘리스그룹 2025년 총점 0.63 상세" })).toBeInTheDocument();
    expect(screen.getByText("빗금 = 미확정")).toBeInTheDocument();
  });

  it("opens the confirmation detail on cell click", () => {
    render(<ScoreHeatmap periods={PERIODS} rows={[row(1, "엘리스그룹", 0.63, 0.64)]} />);

    fireEvent.click(screen.getByRole("button", { name: "엘리스그룹 2025년 총점 0.63 상세" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("엘리스그룹 · 2025년")).toBeInTheDocument();
    expect(within(dialog).getByText("0.63")).toBeInTheDocument();
    expect(within(dialog).getByText("우수")).toBeInTheDocument();
    expect(within(dialog).getByText("3위")).toBeInTheDocument();
  });

  it("pages twenty companies at a time", () => {
    const rows = Array.from({ length: 25 }, (_, index) => row(index + 1, `기업${index + 1}`, 0.5, 0.5));
    const { container } = render(<ScoreHeatmap periods={PERIODS} rows={rows} />);

    expect(container.querySelectorAll("tbody tr")).toHaveLength(20);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("explains the empty state", () => {
    render(<ScoreHeatmap periods={[]} rows={[]} />);

    expect(screen.getByText(/확정 기록이 없습니다/)).toBeInTheDocument();
  });
});
