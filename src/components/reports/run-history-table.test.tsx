import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RunHistoryTable } from "@/components/reports/run-history-table";
import type { RunHistoryRow } from "@/lib/repositories/analysisRun";

function row(over: Partial<RunHistoryRow> = {}): RunHistoryRow {
  return {
    id: 7,
    companyId: 1,
    companyName: "딥노이드",
    status: "completed",
    articleCount: 20,
    verdict: "verified",
    usage: { inputTokens: 100, outputTokens: 20 },
    periodStart: null,
    periodEnd: null,
    createdAt: "2026-08-30T09:00:00.000Z",
    completedAt: "2026-08-30T09:05:00.000Z",
    ...over,
  };
}

describe("RunHistoryTable", () => {
  it("renders a completed run with article count, token total and an excel link", () => {
    render(<RunHistoryTable rows={[row()]} />);

    expect(screen.getByText("딥노이드")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "엑셀" })).toHaveAttribute("href", "/api/reports/7");
  });

  it("shows no excel link for an incomplete run and explains an empty history", () => {
    render(<RunHistoryTable rows={[row({ id: 8, status: "running", verdict: null, usage: null, completedAt: null })]} />);
    expect(screen.queryByRole("link", { name: "엑셀" })).toBeNull();

    render(<RunHistoryTable rows={[]} />);
    expect(screen.getByText(/실행 이력이 없습니다/)).toBeInTheDocument();
  });
});
