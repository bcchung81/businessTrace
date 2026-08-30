import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfirmSelection } from "@/components/ranking/confirm-selection";

const confirm = vi.fn(async (_input: unknown) => ({ ok: true as const, saved: 48 }));
vi.mock("@/app/ranking/actions", () => ({ confirmSelectionAction: (input: unknown) => confirm(input) }));

describe("ConfirmSelection", () => {
  it("opens a modal and calls the action with year and rubric, then reports the count", async () => {
    render(<ConfirmSelection year={2026} rubricId="default" count={48} formulaVersion="rank-v1" />);

    fireEvent.click(screen.getByRole("button", { name: "시상 확정" }));
    expect(screen.getByText(/48개사/)).toBeInTheDocument();
    expect(screen.getByText("rank-v1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "확정 저장" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith({ year: 2026, rubricId: "default" }));
    await waitFor(() => expect(screen.getByText(/48건 저장/)).toBeInTheDocument());
  });
});
