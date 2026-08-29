import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { GrowthRanking, sparkPath } from "@/components/dashboard/growth-ranking";
import type { PensionPoint } from "@/lib/repositories/pensionSnapshot";

function points(values: Array<number | null>): PensionPoint[] {
  return values.map((subscribers, index) => ({
    ym: `2026${String(index + 1).padStart(2, "0")}`,
    subscribers,
    noticeAmount: null,
    hired: null,
    departed: null,
  }));
}

const RANKING = [
  {
    companyId: 2,
    name: "올림플래닛",
    from: 68,
    latest: 32,
    delta: -36,
    ratio: -36 / 68,
    points: points([68, 60, 43, 32]),
  },
  {
    companyId: 1,
    name: "크립토랩",
    from: 56,
    latest: 61,
    delta: 5,
    ratio: 5 / 56,
    points: points([56, 54, 58, 61]),
  },
];

describe("sparkPath", () => {
  test("draws a point for every measured month", () => {
    const path = sparkPath([1, 2, 3], 60, 20);

    expect(path.split("L")).toHaveLength(3);
  });

  test("draws a flat line when nothing changed, instead of dividing by zero", () => {
    expect(sparkPath([4, 4, 4], 60, 20)).toContain("10");
  });

  test("skips a month with no measurement rather than dropping to zero", () => {
    const path = sparkPath([10, null, 12], 60, 20);

    expect(path.split("L")).toHaveLength(2);
  });

  test("returns nothing to draw for an empty series", () => {
    expect(sparkPath([], 60, 20)).toBe("");
  });
});

describe("GrowthRanking", () => {
  test("marks a decline with a down triangle, the way a stock table does", () => {
    render(<GrowthRanking ranking={RANKING} />);
    const row = screen.getAllByRole("row")[1];

    expect(within(row).getByText(/▼/)).toBeInTheDocument();
    expect(within(row).getByText(/52\.9%/)).toBeInTheDocument();
  });

  test("marks a gain with an up triangle", () => {
    render(<GrowthRanking ranking={RANKING} />);
    const row = screen.getAllByRole("row")[2];

    expect(within(row).getByText(/▲/)).toBeInTheDocument();
    expect(within(row).getByText(/8\.9%/)).toBeInTheDocument();
  });

  test("never writes a bare plus or minus sign in the change column", () => {
    render(<GrowthRanking ranking={RANKING} />);
    const table = screen.getByRole("table", { name: "12개월 가입자 증감" });

    expect(within(table).queryByText("-52.9%")).not.toBeInTheDocument();
    expect(within(table).queryByText("+8.9%")).not.toBeInTheDocument();
  });

  test("gives every row its own trend line", () => {
    render(<GrowthRanking ranking={RANKING} />);

    expect(screen.getByRole("img", { name: "올림플래닛 12개월 추이" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "크립토랩 12개월 추이" })).toBeInTheDocument();
  });

  test("keeps the numbers readable beside the trend line", () => {
    render(<GrowthRanking ranking={RANKING} />);
    const row = screen.getAllByRole("row")[1];

    expect(within(row).getByText("68")).toBeInTheDocument();
    expect(within(row).getByText("32")).toBeInTheDocument();
  });

  test("says why the ranking is empty instead of drawing an empty axis", () => {
    render(<GrowthRanking ranking={[]} />);

    expect(screen.getByText(/두 달 이상/)).toBeInTheDocument();
  });
});
