import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScoreTrend } from "@/components/history/score-trend";

describe("ScoreTrend", () => {
  it("renders one facet per company on a monthly axis with its latest total and grade", () => {
    render(
      <ScoreTrend
        facets={[
          {
            companyId: 1,
            name: "딥노이드",
            grade: "우수",
            points: [
              { ym: "202512", total: 0.5 },
              { ym: "202606", total: 0.64 },
              { ym: "202612", total: 0.71 },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText("딥노이드")).toBeInTheDocument();
    expect(screen.getByText("0.71")).toBeInTheDocument();
    expect(screen.getByText("우수")).toBeInTheDocument();
    expect(screen.getByText(/25\.12 ~ 26\.12/)).toBeInTheDocument();
  });

  it("explains the empty state instead of a blank panel", () => {
    render(<ScoreTrend facets={[]} />);

    expect(screen.getByText(/시상 확정이 없습니다/)).toBeInTheDocument();
  });
});
