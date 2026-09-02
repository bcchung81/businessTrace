import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import Loading from "@/app/loading";
import ErrorPage from "@/app/error";
import NotFound from "@/app/not-found";

describe("app states", () => {
  test("loading announces itself to assistive tech", () => {
    render(<Loading />);
    expect(screen.getByRole("status")).toHaveTextContent("불러오는 중");
  });

  test("error shows the message, a retry button and the digest", () => {
    const reset = vi.fn();
    render(<ErrorPage error={Object.assign(new Error("DB 연결 실패"), { digest: "abc123" })} reset={reset} />);
    expect(screen.getByRole("alert")).toHaveTextContent("DB 연결 실패");
    expect(screen.getByText("abc123")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(reset).toHaveBeenCalled();
  });

  test("not-found links back to the company list", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { name: "없는 페이지" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "기업 목록으로" })).toHaveAttribute("href", "/companies");
  });
});
