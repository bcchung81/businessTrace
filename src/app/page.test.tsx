import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import Home from "@/app/page";

describe("대시보드 페이지", () => {
  test("shows the dashboard heading", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: "대시보드" }),
    ).toBeInTheDocument();
  });

  test("offers a shortcut to the company management screen", () => {
    render(<Home />);

    expect(screen.getByRole("link", { name: "기업 관리로 이동" })).toHaveAttribute(
      "href",
      "/companies",
    );
  });
});
