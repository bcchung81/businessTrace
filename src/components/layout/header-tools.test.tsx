import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { HeaderTools } from "@/components/layout/header-tools";

const TOOLS = { year: 2026, thisMonth: { year: 2026, month: 9 }, lastMonth: { year: 2026, month: 8 }, pendingIds: [3, 5] };

describe("HeaderTools", () => {
  test("offers this and last month's workbook and the pending-companies run link", () => {
    render(<HeaderTools tools={TOOLS} />);

    expect(screen.getByText("월간 문서 ▾")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이번 달" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "지난 달" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "미분석 2개사 실행" })).toHaveAttribute("href", "/companies?year=2026&run=3,5&stage=full#batch");
  });

  test("drops the run link when nothing is pending", () => {
    render(<HeaderTools tools={{ ...TOOLS, pendingIds: [] }} />);

    expect(screen.queryByRole("link", { name: /미분석/ })).not.toBeInTheDocument();
    expect(screen.getByText("월간 문서 ▾")).toBeInTheDocument();
  });

  test("matches the header's 28px control height", () => {
    render(<HeaderTools tools={TOOLS} />);

    expect(screen.getByText("월간 문서 ▾")).toHaveClass("h-7");
    expect(screen.getByRole("link", { name: "미분석 2개사 실행" })).toHaveClass("h-7");
  });
});
