import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test, vi, beforeEach } from "vitest";

const auth = vi.fn();
const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});

vi.mock("@/auth", () => ({ auth: () => auth() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path) }));
vi.mock("@/lib/services/headerTools", () => ({
  loadHeaderTools: async () => ({ year: 2026, thisMonth: { year: 2026, month: 9 }, lastMonth: { year: 2026, month: 8 }, pendingIds: [] }),
}));
vi.mock("@/lib/services/batchRegistry", () => ({ readBatch: () => null }));

const { default: AppLayout } = await import("@/app/(app)/layout");

describe("(app) layout guards every page", () => {
  beforeEach(() => {
    auth.mockReset();
    redirect.mockClear();
  });

  test("sends an unauthenticated visitor to the login page", async () => {
    auth.mockResolvedValue(null);

    await expect(AppLayout({ children: null } as never)).rejects.toThrow("REDIRECT:/login");
  });

  test("renders the shell for a signed-in user", async () => {
    auth.mockResolvedValue({ user: { id: "1", email: "a@b.kr" } });

    await expect(AppLayout({ children: null } as never)).resolves.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("login is outside the app shell", () => {
  test("the root layout no longer wraps everything in AppShell", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/layout.tsx"), "utf8");

    expect(source).not.toMatch(/AppShell/);
  });
});
