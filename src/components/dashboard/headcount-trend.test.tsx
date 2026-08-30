import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { HeadcountInline, HeadcountTrend } from "@/components/dashboard/headcount-trend";
import type { Facet } from "@/lib/services/dashboardSummary";

function facet(over: Partial<Facet> = {}): Facet {
  return {
    companyId: 1,
    name: "크립토랩",
    points: [
      { ym: "202606", subscribers: 54, noticeAmount: null, hired: null, departed: null },
      { ym: "202607", subscribers: 61, noticeAmount: 27000180, hired: 7, departed: 2 },
    ],
    latest: 61,
    from: 54,
    delta: 7,
    ratio: 7 / 54,
    direction: "up",
    ...over,
  };
}

describe("HeadcountTrend", () => {
  test("prints the latest headcount so the value survives without the chart", () => {
    render(<HeadcountTrend facets={[facet()]} />);

    expect(screen.getByText("크립토랩")).toBeInTheDocument();
    expect(screen.getByText("61")).toBeInTheDocument();
  });

  test("names the direction in words, never by colour alone", () => {
    render(<HeadcountTrend facets={[facet({ direction: "down", ratio: -0.53, latest: 32 })]} />);

    expect(screen.getByText(/감소/)).toBeInTheDocument();
    expect(screen.getByText("-53%")).toBeInTheDocument();
  });

  test("tells the operator how to fill an empty dashboard", () => {
    render(<HeadcountTrend facets={[]} />);

    expect(screen.getByText(/collect-pension/)).toBeInTheDocument();
  });

  test("inline variant sits beside a company name with count, direction in words, delta and range", () => {
    render(<HeadcountInline facet={facet({ direction: "down", ratio: -0.16, latest: 190 })} />);
    const group = screen.getByRole("group", { name: "고용 규모 12개월" });
    expect(group).toHaveTextContent("가입자");
    expect(group).toHaveTextContent("감소");
    expect(group).toHaveTextContent("세로축 0부터");
  });

  test("inline variant says so when there is no snapshot instead of drawing an empty chart", () => {
    render(<HeadcountInline facet={null} />);
    expect(screen.getByRole("group", { name: "고용 규모 12개월" })).toHaveTextContent("연금 스냅샷 없음");
  });
});
