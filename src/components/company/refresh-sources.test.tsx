import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { RefreshSources } = await import("@/components/company/refresh-sources");

describe("RefreshSources", () => {
  test("re-renders the page after a successful lookup so the new snapshots appear", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
    render(<RefreshSources companyId={3} fetchImpl={fetchImpl} />);

    fireEvent.click(screen.getByRole("button", { name: "원천 조회" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
