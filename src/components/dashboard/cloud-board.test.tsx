import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { CloudBoard } from "@/components/dashboard/cloud-board";

const DATASETS = [
  {
    key: "subscribers",
    label: "가입자수",
    unit: "명",
    items: [
      { id: 1, name: "길의료재단", value: 3034 },
      { id: 2, name: "딥로딩", value: 6 },
    ],
  },
  {
    key: "payroll",
    label: "추정 연 인건비",
    unit: "",
    formatter: "eok" as const,
    items: [{ id: 3, name: "코난 테크놀로지", value: 11_960_000_000 }],
  },
];

describe("CloudBoard", () => {
  test("opens on the first basis", () => {
    render(<CloudBoard datasets={DATASETS} />);

    expect(screen.getByText("길의료재단")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "가입자수" })).toHaveAttribute("aria-selected", "true");
  });

  test("swaps the cloud when another basis is chosen", () => {
    render(<CloudBoard datasets={DATASETS} />);

    fireEvent.click(screen.getByRole("tab", { name: "추정 연 인건비" }));

    expect(screen.getByText("코난 테크놀로지")).toBeInTheDocument();
    expect(screen.queryByText("길의료재단")).not.toBeInTheDocument();
  });

  test("applies the formatter that belongs to the chosen basis", () => {
    render(<CloudBoard datasets={DATASETS} />);

    fireEvent.click(screen.getByRole("tab", { name: "추정 연 인건비" }));

    expect(screen.getByRole("listitem", { name: /코난/ })).toHaveAccessibleName(
      "코난 테크놀로지 119.6억",
    );
  });

  test("marks the chosen basis so the number can never be read against the wrong one", () => {
    render(<CloudBoard datasets={DATASETS} />);

    fireEvent.click(screen.getByRole("tab", { name: "추정 연 인건비" }));

    expect(screen.getByRole("tab", { name: "추정 연 인건비" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "가입자수" })).toHaveAttribute("aria-selected", "false");
  });

  test("carries nothing a server component cannot hand to a client component", () => {
    expect(JSON.parse(JSON.stringify(DATASETS))).toEqual(DATASETS);
  });
});
