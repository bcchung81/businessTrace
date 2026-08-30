import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Ribbon } from "@/components/ui/ribbon";

const ITEMS = ["검증 통과 31", "검토 12", "리스크 3"];

describe("Ribbon", () => {
  test("names the items once for assistive tech", () => {
    render(<Ribbon items={ITEMS} />);

    expect(screen.getByRole("img", { name: "검증 통과 31 · 검토 12 · 리스크 3" })).toBeInTheDocument();
  });

  test("prints every item exactly once — the strip stands still", () => {
    render(<Ribbon items={ITEMS} />);

    expect(screen.getAllByText("리스크 3")).toHaveLength(1);
    expect(screen.getByRole("img", { name: /검증 통과 31/ }).querySelector(".ribbon-drift")).toBeNull();
  });

  test("is the primary strip in the display face", () => {
    render(<Ribbon items={ITEMS} />);
    const band = screen.getByRole("img", { name: /검증 통과 31/ });

    expect(band).toHaveClass("bg-primary", "text-primary-foreground");
    expect(band.firstElementChild).toHaveClass("font-display");
    expect(band.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
