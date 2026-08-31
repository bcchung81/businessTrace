import { beforeEach, describe, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { DELETE, PATCH } from "@/app/api/companies/[id]/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const patch = (body: unknown) => new Request("http://localhost", { method: "PATCH", body: JSON.stringify(body) });

describe("/api/companies/[id]", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(auth).mockResolvedValue({ user: { id: "1" } } as never);
  });

  test("PATCH refuses a non-numeric id with 400 rather than crashing on NaN", async () => {
    expect((await PATCH(patch({ name: "가" }), ctx("abc"))).status).toBe(400);
  });

  test("DELETE refuses a non-numeric id with 400 and still 404s an unknown one", async () => {
    expect((await DELETE(new Request("http://localhost"), ctx("abc"))).status).toBe(400);
    expect((await DELETE(new Request("http://localhost"), ctx("999"))).status).toBe(404);
  });

  test("PATCH still updates a real company", async () => {
    const company = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    const response = await PATCH(patch({ name: "㈜나" }), ctx(String(company.id)));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ company: { name: "㈜나" } });
  });
});
