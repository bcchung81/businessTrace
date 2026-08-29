import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { VerdictBoard } from "@/components/dashboard/verdict-board";

const COUNTS = { verified: 31, review: 12, risk: 3, pending: 4 };

describe("VerdictBoard", () => {
  test("prints each verdict with its count and share", () => {
    render(<VerdictBoard counts={COUNTS} averageCitations={6.2} />);

    const verified = screen.getByRole("group", { name: "검증 통과" });
    expect(within(verified).getByText("31")).toBeInTheDocument();
    expect(within(verified).getByText("62%")).toBeInTheDocument();
    expect(within(verified).getByText(/6\.2/)).toBeInTheDocument();
  });

  test("draws the share bar with one segment per verdict, pending hatched", () => {
    render(<VerdictBoard counts={COUNTS} averageCitations={6.2} />);
    const bar = screen.getByRole("img", { name: /판정 비율/ });

    expect(bar.children).toHaveLength(4);
    expect(bar.children[3]).toHaveClass("hatch");
  });

  test("shows zero shares without dividing by zero", () => {
    render(<VerdictBoard counts={{ verified: 0, review: 0, risk: 0, pending: 0 }} averageCitations={0} />);

    expect(screen.getAllByText("0%")).toHaveLength(4);
  });
});
