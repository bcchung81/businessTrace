import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Badge } from "@/components/ui/badge";

describe("Badge", () => {
  test("ink variant is a small hard-shadowed chip", () => {
    render(<Badge variant="ink">실측</Badge>);

    expect(screen.getByText("실측")).toHaveClass("border-2", "border-ink", "shadow-[2px_2px_0_var(--ink)]");
  });

  test("stamp variant is dashed and uppercase", () => {
    render(<Badge variant="stamp">draft</Badge>);

    expect(screen.getByText("draft")).toHaveClass("border-dashed", "uppercase");
  });
});
