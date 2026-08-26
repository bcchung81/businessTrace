import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  test("renders its label as a button element", () => {
    render(<Button>분석 시작</Button>);

    expect(screen.getByRole("button", { name: "분석 시작" })).toBeInTheDocument();
  });

  test("renders the child element instead of a button when asChild is set", () => {
    render(
      <Button asChild>
        <a href="/companies">기업 목록</a>
      </Button>,
    );

    expect(screen.getByRole("link", { name: "기업 목록" })).toHaveAttribute(
      "href",
      "/companies",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("is not clickable when disabled", () => {
    render(<Button disabled>비활성</Button>);

    expect(screen.getByRole("button", { name: "비활성" })).toBeDisabled();
  });
});
