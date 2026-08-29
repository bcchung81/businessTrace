import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ScaleScatter, logAxis } from "@/components/dashboard/scale-scatter";

const POINTS = [
  { companyId: 1, name: "크립토랩", subscribers: 61, averageBaseIncome: 4918066, annualPayroll: 3600024000 },
];

describe("ScaleScatter", () => {
  test("carries every plotted point in a table as well", () => {
    render(<ScaleScatter points={POINTS} />);
    const table = screen.getByRole("table", { name: "기업별 규모와 1인 기준소득월액" });

    expect(within(table).getByText("크립토랩")).toBeInTheDocument();
    expect(within(table).getByText("4,918,066원")).toBeInTheDocument();
    expect(within(table).getByText("36.0억")).toBeInTheDocument();
  });

  test("says the notice amount is missing rather than plotting nothing", () => {
    render(<ScaleScatter points={[]} />);

    expect(screen.getByText(/고지금액이 확보된 기업이 없습니다/)).toBeInTheDocument();
  });

  test("keeps the scatter readable when one organisation dwarfs the rest", () => {
    render(
      <ScaleScatter
        points={[
          ...POINTS,
          { companyId: 2, name: "길의료재단", subscribers: 3034, averageBaseIncome: 4000000, annualPayroll: 1e11 },
        ]}
      />,
    );

    expect(screen.getByText(/로그 눈금/)).toBeInTheDocument();
  });
});

describe("logAxis", () => {
  test("widens the domain to the powers of ten that bracket the data", () => {
    expect(logAxis([4, 235, 3034]).domain).toEqual([1, 10000]);
  });

  test("puts a tick on every power of ten inside the domain", () => {
    expect(logAxis([4, 235, 3034]).ticks).toEqual([1, 10, 100, 1000, 10000]);
  });

  test("still gives a full decade when every value sits in one", () => {
    expect(logAxis([12, 40, 88]).domain).toEqual([10, 100]);
  });

  test("ignores values a log scale cannot place", () => {
    expect(logAxis([0, -5, 40]).domain).toEqual([10, 100]);
  });

  test("falls back to a single decade when there is nothing to plot", () => {
    expect(logAxis([]).domain).toEqual([1, 10]);
  });
});
