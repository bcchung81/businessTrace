import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Card, CardContent } from "@/components/ui/card";

describe("Card", () => {
  test("default keeps the shadcn look", () => {
    render(<Card data-testid="card"><CardContent>본문</CardContent></Card>);

    expect(screen.getByTestId("card")).toHaveClass("shadow-sm");
    expect(screen.getByTestId("card")).not.toHaveClass("border-ink");
  });

  test("comic variant draws the ink border and large hard shadow", () => {
    render(<Card variant="comic" data-testid="card"><CardContent>본문</CardContent></Card>);

    expect(screen.getByTestId("card")).toHaveClass("border-2", "border-ink", "shadow-hard-lg");
    expect(screen.getByTestId("card")).toHaveAttribute("data-variant", "comic");
  });

  test("paper variant sits on cream with grain", () => {
    render(<Card variant="paper" data-testid="card"><CardContent>본문</CardContent></Card>);

    expect(screen.getByTestId("card")).toHaveClass("bg-paper", "paper-grain", "shadow-hard");
  });
});
