import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";

const search = vi.fn(() => new URLSearchParams("year=2026&sort=name&page=2"));
vi.mock("next/navigation", () => ({
  usePathname: () => "/companies",
  useSearchParams: () => search(),
}));
import { useUrlState } from "@/lib/hooks/useUrlState";

let replace: MockInstance<History["replaceState"]>;

beforeEach(() => {
  replace = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
});

afterEach(() => {
  replace.mockRestore();
});

describe("useUrlState", () => {
  test("reads present keys and falls back to defaults", () => {
    const { result } = renderHook(() => useUrlState({ sort: "triage", page: "0", q: "" }));
    expect(result.current[0]).toEqual({ sort: "name", page: "2", q: "" });
  });

  test("writes a patch, drops defaults and keeps unrelated params — without a server round trip", () => {
    const { result } = renderHook(() => useUrlState({ sort: "triage", page: "0", q: "" }));
    act(() => result.current[1]({ sort: "triage", page: "0", q: "옥타" }));
    expect(replace).toHaveBeenCalledWith(null, "", "/companies?year=2026&q=%EC%98%A5%ED%83%80");
  });
});
