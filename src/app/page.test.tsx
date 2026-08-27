import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import Home from "@/app/page";

describe("대시보드 페이지", () => {
  test("leads with the verification promise, not a generic dashboard label", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("공식 출처와 대조");
  });

  test("names the pipeline stage where unverified analysis is held back", () => {
    render(<Home />);

    expect(screen.getByText("검토 필요")).toBeInTheDocument();
  });

  test("offers a shortcut to the company management screen", () => {
    render(<Home />);

    expect(screen.getByRole("link", { name: "기업 관리로 이동" })).toHaveAttribute(
      "href",
      "/companies",
    );
  });
});
