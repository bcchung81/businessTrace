import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Card, CardContent } from "@/components/ui/card";

describe("Card", () => {
  test("default keeps the shadcn look", () => {
    render(<Card data-testid="card"><CardContent>본문</CardContent></Card>);

    expect(screen.getByTestId("card")).toHaveClass("shadow-sm");
    expect(screen.getByTestId("card")).not.toHaveClass("border-ink");
  });

  test("signal variant draws the ink border without a shadow", () => {
    render(<Card variant="signal" data-testid="card"><CardContent>본문</CardContent></Card>);

    expect(screen.getByTestId("card")).toHaveClass("border-[1.5px]", "border-ink", "rounded-none");
    expect(screen.getByTestId("card")).not.toHaveClass("shadow-hard-lg");
    expect(screen.getByTestId("card")).toHaveAttribute("data-variant", "signal");
  });
});
