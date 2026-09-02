import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

const replace = vi.fn();
const search = vi.fn(() => new URLSearchParams("year=2026&sort=name&page=2"));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/companies",
  useSearchParams: () => search(),
}));
import { useUrlState } from "@/lib/hooks/useUrlState";

describe("useUrlState", () => {
  test("reads present keys and falls back to defaults", () => {
    const { result } = renderHook(() => useUrlState({ sort: "triage", page: "0", q: "" }));
    expect(result.current[0]).toEqual({ sort: "name", page: "2", q: "" });
  });

  test("writes a patch, drops defaults, keeps unrelated params and does not scroll", () => {
    const { result } = renderHook(() => useUrlState({ sort: "triage", page: "0", q: "" }));
    act(() => result.current[1]({ sort: "triage", page: "0", q: "옥타" }));
    expect(replace).toHaveBeenCalledWith("/companies?year=2026&q=%EC%98%A5%ED%83%80", { scroll: false });
  });
});
