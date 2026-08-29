/* eslint-disable @next/next/no-html-link-for-pages -- 라우팅이 아니라 asChild 렌더를 검증하는 앵커다 */
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

  test("hard variant carries the ink border and hard shadow", () => {
    render(<Button variant="hard">분석 실행</Button>);
    const button = screen.getByRole("button", { name: "분석 실행" });

    expect(button).toHaveClass("border-2", "border-ink", "shadow-hard", "bg-primary");
    expect(button).toHaveAttribute("data-variant", "hard");
  });

  test("hard-outline variant keeps the background plain", () => {
    render(<Button variant="hard-outline">목록으로</Button>);

    expect(screen.getByRole("button", { name: "목록으로" })).toHaveClass("border-ink", "shadow-hard", "bg-background");
  });

  test("display size sets the display face in uppercase", () => {
    render(<Button variant="hard" size="display">RUN</Button>);

    expect(screen.getByRole("button", { name: "RUN" })).toHaveClass("font-display", "uppercase");
  });
});
