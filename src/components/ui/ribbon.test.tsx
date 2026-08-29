import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Ribbon } from "@/components/ui/ribbon";

const ITEMS = ["검증 통과 31", "검토 12", "리스크 3"];

describe("Ribbon", () => {
  test("names the items once for assistive tech", () => {
    render(<Ribbon items={ITEMS} />);

    expect(screen.getByLabelText("검증 통과 31 · 검토 12 · 리스크 3")).toBeInTheDocument();
  });

  test("repeats the run three times so the drift loops seamlessly", () => {
    render(<Ribbon items={ITEMS} />);

    expect(screen.getAllByText("리스크 3")).toHaveLength(3);
  });

  test("is the only tilted element and drifts unless motion is reduced", () => {
    render(<Ribbon items={ITEMS} />);
    const band = screen.getByLabelText(/검증 통과 31/);

    expect(band).toHaveClass("-rotate-1", "bg-primary", "border-ink");
    expect(band.firstElementChild).toHaveClass("ribbon-drift", "font-display", "uppercase");
    expect(band.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
