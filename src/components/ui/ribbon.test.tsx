import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Ribbon } from "@/components/ui/ribbon";

const ITEMS = ["검증 통과 31", "검토 12", "리스크 3"];

describe("Ribbon", () => {
  test("names the items once for assistive tech", () => {
    render(<Ribbon items={ITEMS} />);

    expect(screen.getByRole("img", { name: "검증 통과 31 · 검토 12 · 리스크 3" })).toBeInTheDocument();
  });

  test("repeats the run three times so the drift loops seamlessly", () => {
    render(<Ribbon items={ITEMS} />);

    expect(screen.getAllByText("리스크 3")).toHaveLength(3);
  });

  test("lies flat and drifts unless motion is reduced", () => {
    render(<Ribbon items={ITEMS} />);
    const band = screen.getByRole("img", { name: /검증 통과 31/ });

    expect(band).toHaveClass("bg-primary", "border-ink");
    expect(band).not.toHaveClass("-rotate-1");
    expect(band.firstElementChild).toHaveClass("ribbon-drift", "hover:[animation-play-state:paused]", "font-display", "uppercase");
    expect(band.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
