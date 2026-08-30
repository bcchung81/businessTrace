import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Badge } from "@/components/ui/badge";

describe("Badge", () => {
  test("signal variant is a solid ink block", () => {
    render(<Badge variant="signal">실측</Badge>);

    expect(screen.getByText("실측")).toHaveClass("bg-ink", "text-background", "rounded-none");
  });

  test("signal-outline variant keeps the ink as a border", () => {
    render(<Badge variant="signal-outline">draft</Badge>);

    expect(screen.getByText("draft")).toHaveClass("border-ink", "rounded-none");
  });
});
