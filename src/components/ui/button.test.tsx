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

  test("signal variant is the square primary block without a shadow", () => {
    render(<Button variant="signal">분석 실행</Button>);
    const button = screen.getByRole("button", { name: "분석 실행" });

    expect(button).toHaveClass("rounded-none", "bg-primary");
    expect(button).not.toHaveClass("shadow-hard");
    expect(button).toHaveAttribute("data-variant", "signal");
  });

  test("signal-outline variant keeps the background plain", () => {
    render(<Button variant="signal-outline">목록으로</Button>);

    expect(screen.getByRole("button", { name: "목록으로" })).toHaveClass("border-ink", "rounded-none", "bg-background");
  });

  test("display size sets the display face", () => {
    render(<Button variant="signal" size="display">RUN</Button>);

    expect(screen.getByRole("button", { name: "RUN" })).toHaveClass("font-display");
  });

  test("signal and signal-outline variants have visible focus indicators", () => {
    render(
      <>
        <Button variant="signal">분석 실행</Button>
        <Button variant="signal-outline">목록으로</Button>
      </>,
    );

    expect(screen.getByRole("button", { name: "분석 실행" })).toHaveClass("focus-visible:outline-solid");
    expect(screen.getByRole("button", { name: "목록으로" })).toHaveClass("focus-visible:outline-solid");
  });
});
