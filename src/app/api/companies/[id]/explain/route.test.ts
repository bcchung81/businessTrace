import { beforeEach, describe, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { GET } from "@/app/api/companies/[id]/explain/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

describe("GET /api/companies/[id]/explain", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(auth).mockResolvedValue({ user: { id: "1" } } as never);
  });

  test("401 without a session, 404 without the company, 200 with the explanation", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    expect((await GET(new Request("http://localhost"), ctx("1"))).status).toBe(401);
    expect((await GET(new Request("http://localhost"), ctx("999"))).status).toBe(404);
    const company = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    const response = await GET(new Request("http://localhost"), ctx(String(company.id)));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ total: null, contributions: expect.any(Array) });
  });
});
