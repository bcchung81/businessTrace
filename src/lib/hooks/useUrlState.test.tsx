import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";

let search = new URLSearchParams();
vi.mock("next/navigation", () => ({ usePathname: () => "/companies", useSearchParams: () => search }));

import { useUrlState } from "@/lib/hooks/useUrlState";

const DEFAULTS = { sort: "triage", page: "0", q: "" };
const FLAGS = { notice: "", positive: "", page: "0" };

let replace: MockInstance<History["replaceState"]>;

function goto(query: string) {
  search = new URLSearchParams(query);
  window.history.replaceState(null, "", query ? `/companies?${query}` : "/companies");
  replace.mockClear();
}

beforeEach(() => {
  replace = vi.spyOn(window.history, "replaceState");
  goto("year=2026&sort=name&page=2");
});

afterEach(() => {
  replace.mockRestore();
});

describe("useUrlState", () => {
  test("reads present keys and falls back to defaults", () => {
    const { result } = renderHook(() => useUrlState(DEFAULTS));
    expect(result.current[0]).toEqual({ sort: "name", page: "2", q: "" });
  });

  test("writes a patch, drops defaults and keeps unrelated params — without a server round trip", () => {
    const { result } = renderHook(() => useUrlState(DEFAULTS));
    act(() => result.current[1]({ sort: "triage", page: "0", q: "옥타" }));
    expect(replace).toHaveBeenCalledWith(null, "", "/companies?year=2026&q=%EC%98%A5%ED%83%80");
  });

  test("composes the write from the live URL so a second write in the same window keeps the first", () => {
    goto("year=2026");
    const { result } = renderHook(() => useUrlState(FLAGS));
    window.history.replaceState(null, "", "/companies?year=2026&notice=1");

    act(() => result.current[1]({ positive: "1" }));
    expect(replace).toHaveBeenLastCalledWith(null, "", "/companies?year=2026&notice=1&positive=1");
  });

  test("skips the write when nothing changes", () => {
    goto("year=2026&sort=name");
    const { result } = renderHook(() => useUrlState(DEFAULTS));

    act(() => result.current[1]({}));
    expect(replace).not.toHaveBeenCalled();
  });
});
