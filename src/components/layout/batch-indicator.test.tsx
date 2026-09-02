import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { BatchIndicator } from "@/components/layout/batch-indicator";

describe("BatchIndicator", () => {
  afterEach(() => vi.useRealTimers());

  test("shows the running batch and hides once the status says none", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ batch: { stage: "full", total: 4, done: 1, startedAt: "x", current: "㈜나" } }))
      .mockResolvedValueOnce(Response.json({ batch: null }));
    render(
      <BatchIndicator initial={{ stage: "full", total: 4, done: 0, startedAt: "x", current: null, aborting: false }} fetchImpl={fetchImpl as unknown as typeof fetch} intervalMs={1000} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("4개사 분석 중 · 0/4");
    expect(screen.getByRole("link")).toHaveAttribute("href", "/companies#batch");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByRole("status")).toHaveTextContent("4개사 분석 중 · 1/4");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  test("renders nothing when idle but still polls", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ batch: null }));
    render(<BatchIndicator initial={null} fetchImpl={fetchImpl as unknown as typeof fetch} intervalMs={1000} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fetchImpl).toHaveBeenCalledWith("/api/analyze/status", expect.anything());
  });
});
