import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { RefreshSourcesButton } from "@/components/company/refresh-sources-button";

describe("RefreshSourcesButton", () => {
  test("posts to the lookup endpoint for this company", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ matched: true }), { status: 200 }),
    ) as unknown as typeof fetch;
    render(<RefreshSourcesButton companyId={7} fetchImpl={fetchImpl} onDone={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "원천 조회" }));

    await waitFor(() =>
      expect(fetchImpl).toHaveBeenCalledWith("/api/companies/7/dart", { method: "POST" }),
    );
  });

  test("says it is working so nobody clicks twice on a slow six-source lookup", async () => {
    let release: () => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      release = () => resolve(new Response("{}", { status: 200 }));
    });
    const fetchImpl = vi.fn(() => pending) as unknown as typeof fetch;
    render(<RefreshSourcesButton companyId={7} fetchImpl={fetchImpl} onDone={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "원천 조회" }));

    expect(await screen.findByRole("button", { name: "조회 중…" })).toBeDisabled();
    release();
  });

  test("surfaces a failed lookup instead of looking like it worked", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    render(<RefreshSourcesButton companyId={7} fetchImpl={fetchImpl} onDone={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "원천 조회" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("조회 실패");
  });

  test("calls back only when the lookup actually succeeded", async () => {
    const onDone = vi.fn();
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    render(<RefreshSourcesButton companyId={7} fetchImpl={fetchImpl} onDone={onDone} />);

    fireEvent.click(screen.getByRole("button", { name: "원천 조회" }));

    await screen.findByRole("alert");
    expect(onDone).not.toHaveBeenCalled();
  });
});
