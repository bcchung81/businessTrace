import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { RegionGrid } from "@/components/dashboard/region-grid";
import type { RegionView } from "@/lib/services/regionRollup";

const VIEW: RegionView = {
  sido: [
    { sido: "서울특별시", companies: 21, subscribers: 1270, conflicts: 0 },
    { sido: "인천광역시", companies: 2, subscribers: 3049, conflicts: 1 },
  ],
  sigungu: [
    {
      key: "서울특별시 서초구",
      sido: "서울특별시",
      sigungu: "서초구",
      companies: 2,
      subscribers: 120,
      conflicts: 0,
      names: ["딥로딩", "트위그팜"],
    },
  ],
  companies: [],
  unlocated: ["SDT"],
  located: 23,
  total: 24,
};

describe("RegionGrid", () => {
  test("gives every one of the seventeen provinces a cell, empty ones included", () => {
    render(<RegionGrid view={VIEW} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(17);
  });

  test("labels a cell with its province, company count and headcount", () => {
    render(<RegionGrid view={VIEW} />);

    expect(screen.getByRole("listitem", { name: /서울/ })).toHaveAccessibleName("서울 21개사 1,270명");
  });

  test("says a province is empty rather than leaving the reader to guess", () => {
    render(<RegionGrid view={VIEW} />);

    expect(screen.getByRole("listitem", { name: /제주/ })).toHaveAccessibleName("제주 0개사");
  });

  test("marks a province whose sources disagree", () => {
    render(<RegionGrid view={VIEW} />);

    expect(screen.getByRole("listitem", { name: /인천/ })).toHaveAccessibleName(
      expect.stringContaining("주소 충돌 1"),
    );
  });

  test("reads out the districts of the province under the pointer", () => {
    render(<RegionGrid view={VIEW} />);

    fireEvent.mouseEnter(screen.getByRole("listitem", { name: /서울/ }));

    expect(screen.getByRole("status")).toHaveTextContent("서초구");
    expect(screen.getByRole("status")).toHaveTextContent("딥로딩");
  });

  test("names the companies it could not place", () => {
    render(<RegionGrid view={VIEW} />);

    expect(screen.getByText(/주소 없음/)).toHaveTextContent("SDT");
  });
});
