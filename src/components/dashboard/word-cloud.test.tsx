import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { WordCloud, cloudSizes } from "@/components/dashboard/word-cloud";

const ITEMS = [
  { id: 1, name: "길의료재단", value: 3034 },
  { id: 2, name: "코난 테크놀로지", value: 190 },
  { id: 3, name: "딥로딩", value: 6 },
];

describe("cloudSizes", () => {
  test("gives the largest value the largest type and the smallest the smallest", () => {
    const sizes = cloudSizes([6, 190, 3034], { min: 12, max: 48 });

    expect(sizes[0]).toBe(12);
    expect(sizes[2]).toBe(48);
  });

  test("grows monotonically with the value", () => {
    const sizes = cloudSizes([1, 10, 100, 1000], { min: 10, max: 40 });

    expect(sizes[0]).toBeLessThan(sizes[1]);
    expect(sizes[1]).toBeLessThan(sizes[2]);
    expect(sizes[2]).toBeLessThan(sizes[3]);
  });

  test("uses a square-root scale so small companies are not crushed to nothing", () => {
    const [, middle] = cloudSizes([1, 25, 100], { min: 0, max: 100 });
    const linearMiddle = ((25 - 1) / (100 - 1)) * 100;

    expect(middle).toBeGreaterThan(linearMiddle);
  });

  test("puts everything at one size when no company stands out", () => {
    expect(cloudSizes([7, 7, 7], { min: 12, max: 48 })).toEqual([30, 30, 30]);
  });

  test("floors a value a square root cannot place", () => {
    expect(cloudSizes([0, 100], { min: 12, max: 48 })[0]).toBe(12);
  });

  test("has nothing to size for an empty list", () => {
    expect(cloudSizes([], { min: 12, max: 48 })).toEqual([]);
  });
});

describe("WordCloud", () => {
  test("shows every company name", () => {
    render(<WordCloud items={ITEMS} unit="명" />);

    expect(screen.getByText("길의료재단")).toBeInTheDocument();
    expect(screen.getByText("딥로딩")).toBeInTheDocument();
  });

  test("sets the biggest company in the biggest type", () => {
    render(<WordCloud items={ITEMS} unit="명" />);

    const size = (name: string) =>
      Number(screen.getByRole("listitem", { name: new RegExp(name) }).style.fontSize.replace("px", ""));
    const big = size("길의료재단");
    const small = size("딥로딩");

    expect(big).toBeGreaterThan(small);
  });

  test("carries the exact number, because type size alone cannot be read off", () => {
    render(<WordCloud items={ITEMS} unit="명" />);
    const item = screen.getByRole("listitem", { name: /길의료재단/ });

    expect(item).toHaveAccessibleName("길의료재단 3,034명");
  });

  test("renders a money value in 억 when that formatter is named", () => {
    render(
      <WordCloud items={[{ id: 1, name: "길의료재단", value: 180_920_000_000 }]} unit="" formatter="eok" />,
    );

    expect(screen.getByRole("listitem", { name: /길의료재단/ })).toHaveAccessibleName(
      "길의료재단 1809.2억",
    );
  });

  test("puts the heaviest company first so the eye lands on it", () => {
    render(<WordCloud items={ITEMS} unit="명" />);
    const items = screen.getAllByRole("listitem");

    expect(within(items[0]).getByText("길의료재단")).toBeInTheDocument();
  });

  test("says there is nothing to draw rather than rendering an empty box", () => {
    render(<WordCloud items={[]} unit="명" />);

    expect(screen.getByText(/표시할 기업이 없습니다/)).toBeInTheDocument();
  });

  test("draws no outline around the circle", () => {
    const { container } = render(<WordCloud items={ITEMS} unit="명" />);

    expect(container.querySelector("circle")).toBeNull();
  });

  test("tones the names by rank so the cloud reads as one ramp, not random colour", () => {
    render(<WordCloud items={ITEMS} unit="명" />);
    const fill = (name: string) =>
      screen.getByRole("listitem", { name: new RegExp(name) }).querySelector("text")?.getAttribute("fill");

    expect(fill("길의료재단")).not.toBe(fill("딥로딩"));
    expect(fill("길의료재단")).toContain("--cloud-");
  });
});

describe("WordCloud hover readout", () => {
  const MENTIONS = [
    { id: 1, name: "코난 테크놀로지", value: 12, detail: "주제 8 · 언급만 4" },
    { id: 2, name: "딥로딩", value: 3 },
  ];

  test("holds the readout empty until a company is pointed at", () => {
    render(<WordCloud items={MENTIONS} unit="회" />);

    expect(screen.getByRole("status")).toHaveTextContent("기업에 마우스를 올리면 값을 보여줍니다");
  });

  test("shows the value of the company under the pointer", () => {
    render(<WordCloud items={MENTIONS} unit="회" />);

    fireEvent.mouseEnter(screen.getByRole("listitem", { name: /코난/ }));

    expect(screen.getByRole("status")).toHaveTextContent("코난 테크놀로지");
    expect(screen.getByRole("status")).toHaveTextContent("12회");
  });

  test("carries the extra breakdown when the dataset supplies one", () => {
    render(<WordCloud items={MENTIONS} unit="회" />);

    fireEvent.mouseEnter(screen.getByRole("listitem", { name: /코난/ }));

    expect(screen.getByRole("status")).toHaveTextContent("주제 8 · 언급만 4");
  });

  test("clears the readout when the pointer leaves", () => {
    render(<WordCloud items={MENTIONS} unit="회" />);

    const item = screen.getByRole("listitem", { name: /코난/ });
    fireEvent.mouseEnter(item);
    fireEvent.mouseLeave(item);

    expect(screen.getByRole("status")).toHaveTextContent("기업에 마우스를 올리면 값을 보여줍니다");
  });

  test("answers the keyboard too so the value is not mouse-only", () => {
    render(<WordCloud items={MENTIONS} unit="회" />);

    fireEvent.focus(screen.getByRole("listitem", { name: /딥로딩/ }));

    expect(screen.getByRole("status")).toHaveTextContent("3회");
  });
});
