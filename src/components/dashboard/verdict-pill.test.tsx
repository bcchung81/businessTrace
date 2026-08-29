import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { VerdictPill } from "@/components/dashboard/verdict-pill";

describe("VerdictPill", () => {
  test.each([
    ["verified", "통과"],
    ["review", "검토"],
    ["risk", "리스크"],
    ["pending", "미분석"],
  ] as const)("names %s as %s in text, not colour alone", (verdict, label) => {
    const { container } = render(<VerdictPill verdict={verdict} />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(container.querySelectorAll("svg")).toHaveLength(1);
  });

  test("wears the status surface and text tokens", () => {
    render(<VerdictPill verdict="risk" />);

    expect(screen.getByText("리스크").closest("span")).toHaveClass("bg-risk-surface", "text-risk");
  });
});
