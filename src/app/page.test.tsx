import { describe, expect, test, vi } from "vitest";

const redirect = vi.fn((_path: string) => {
  throw new Error("NEXT_REDIRECT");
});
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path) }));

import Home from "@/app/page";

describe("루트 페이지", () => {
  test("sends the operator straight to the trend dashboard", () => {
    expect(() => Home()).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
});
