import { beforeEach, describe, expect, test, vi } from "vitest";
import { resetDatabase } from "@/lib/test-support/db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { GET } from "@/app/api/reports/[runId]/route";

const ctx = (runId: string) => ({ params: Promise.resolve({ runId }) }) as never;

describe("GET /api/reports/[runId]", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(auth).mockResolvedValue({ user: { id: "1" } } as never);
  });

  test("401 without a session", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    expect((await GET(new Request("http://localhost"), ctx("1"))).status).toBe(401);
  });

  test("400 for a non-numeric run id, 404 for one that does not exist", async () => {
    expect((await GET(new Request("http://localhost"), ctx("abc"))).status).toBe(400);
    expect((await GET(new Request("http://localhost"), ctx("999"))).status).toBe(404);
  });
});
