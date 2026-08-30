import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScoreTrend } from "@/components/history/score-trend";

describe("ScoreTrend", () => {
  it("renders one facet per company with its latest total and grade", () => {
    render(
      <ScoreTrend
        facets={[
          {
            companyId: 1,
            name: "딥노이드",
            grade: "우수",
            points: [
              { year: 2025, total: 0.5 },
              { year: 2026, total: 0.71 },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText("딥노이드")).toBeInTheDocument();
    expect(screen.getByText("0.71")).toBeInTheDocument();
    expect(screen.getByText("우수")).toBeInTheDocument();
  });

  it("explains the empty state instead of a blank panel", () => {
    render(<ScoreTrend facets={[]} />);

    expect(screen.getByText(/시상 확정이 없습니다/)).toBeInTheDocument();
  });
});
