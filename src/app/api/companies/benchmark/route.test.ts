import { beforeEach, describe, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { GET } from "@/app/api/companies/benchmark/route";

describe("GET /api/companies/benchmark", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(auth).mockResolvedValue({ user: { id: "1" } } as never);
  });

  test("rejects anonymous callers", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const response = await GET(new Request("http://localhost/api/companies/benchmark?year=2026"));
    expect(response.status).toBe(401);
  });

  test("returns ranked rows with the rubric spelled out", async () => {
    await prisma.company.create({ data: { name: "㈜가", year: 2026, industry: "SW" } });
    const response = await GET(new Request("http://localhost/api/companies/benchmark?year=2026&rubric=ict"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.rubric).toMatchObject({ id: "ict", name: "ICT" });
    expect(body.rubric.weightLabel).toContain("리스크 감점");
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toMatchObject({ name: "㈜가", rubricId: "ict", total: null, rank: null });
  });

  test("streams xlsx when asked", async () => {
    await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    const response = await GET(new Request("http://localhost/api/companies/benchmark?year=2026&format=xlsx"));
    expect(response.headers.get("content-type")).toContain("spreadsheetml");
    expect(response.headers.get("content-disposition")).toContain("attachment");
  });

  test("400s on a rubric it does not know", async () => {
    const response = await GET(new Request("http://localhost/api/companies/benchmark?year=2026&rubric=nope"));
    expect(response.status).toBe(400);
  });
  test("400 when year is missing — Number(null) is 0, which used to slip through", async () => {
    const response = await GET(new Request("http://localhost/api/companies/benchmark"));
    expect(response.status).toBe(400);
  });
});
