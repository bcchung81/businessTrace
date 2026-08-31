import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AwardBoard } from "@/components/history/award-board";

const CATEGORIES = [
  { id: "three_year_excellent" as const, label: "3년 연속 우수", winners: [] },
  { id: "best_newcomer" as const, label: "신규 최고 점수", winners: [{ companyId: 20, companyName: "엘리스그룹", detail: "첫 등록 · 총점 0.63" }] },
];

describe("AwardBoard", () => {
  it("separates winners from body text with the accent tone", () => {
    render(<AwardBoard categories={CATEGORIES} />);

    const name = screen.getByText("엘리스그룹");
    expect(name.className).toContain("text-accent-foreground");
    expect(name.closest("li")?.className).toContain("bg-accent");
    expect(screen.getByText("첫 등록 · 총점 0.63").className).toContain("text-accent-foreground");
  });

  it("marks the filled category with the primary rule and leaves empty ones muted", () => {
    render(<AwardBoard categories={CATEGORIES} />);

    const filled = screen.getByText("신규 최고 점수").closest("div")!;
    expect(filled.className).toContain("border-primary");
    const empty = screen.getByText("3년 연속 우수").closest("div")!;
    expect(empty.className).toContain("border-ink");
    expect(screen.getByText("해당 기업 없음").className).toContain("text-muted-foreground");
  });
});
