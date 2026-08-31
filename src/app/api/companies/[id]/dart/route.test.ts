import { beforeEach, describe, expect, test, vi } from "vitest";
import { resetDatabase } from "@/lib/test-support/db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/services/dartCorpCode", () => ({ refreshCorpCodes: vi.fn() }));
import { auth } from "@/auth";
import { refreshCorpCodes } from "@/lib/services/dartCorpCode";
import { POST } from "@/app/api/companies/[id]/dart/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

describe("POST /api/companies/[id]/dart", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(auth).mockResolvedValue({ user: { id: "1" } } as never);
    vi.mocked(refreshCorpCodes).mockClear();
  });

  test("rejects a non-numeric id before downloading the 20MB corp code list", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST" }), ctx("abc"));

    expect(response.status).toBe(400);
    expect(refreshCorpCodes).not.toHaveBeenCalled();
  });
});
