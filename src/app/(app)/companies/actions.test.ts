import { beforeEach, describe, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/refreshSources", () => ({ refreshSourcesFor: vi.fn(async () => ({})) }));
import { auth } from "@/auth";
import { refreshSourcesFor } from "@/lib/services/refreshSources";
import { editCompanyAction, setCompanyActiveAction } from "@/app/(app)/companies/actions";

describe("company edit actions", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(auth).mockResolvedValue({ user: { id: "7" } } as never);
    vi.mocked(refreshSourcesFor).mockClear();
  });

  test("refuse anonymous callers", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    expect(await editCompanyAction({ companyId: 1, name: "x", industry: "", businessNo: "", aliases: [] })).toEqual({ ok: false, message: "unauthorized" });
  });

  test("edits name, industry, aliases; a new business number re-checks the sources", async () => {
    const c = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    expect(await editCompanyAction({ companyId: c.id, name: " ㈜가나 ", industry: "ICT", businessNo: "120-88-24298", aliases: [" 가나 ", "가나", ""] })).toEqual({ ok: true });
    const stored = await prisma.company.findUniqueOrThrow({ where: { id: c.id } });
    expect(stored).toMatchObject({ name: "㈜가나", industry: "ICT", businessNo: "1208824298", aliases: JSON.stringify(["가나"]) });
    expect(refreshSourcesFor).toHaveBeenCalledWith(c.id);
  });

  test("an unchanged business number does not re-check the sources; empty fields clear", async () => {
    const c = await prisma.company.create({ data: { name: "㈜가", year: 2026, businessNo: "1208824298", industry: "ICT", aliases: JSON.stringify(["가"]) } });
    expect(await editCompanyAction({ companyId: c.id, name: "㈜가", industry: "", businessNo: "120-88-24298", aliases: [] })).toEqual({ ok: true });
    const stored = await prisma.company.findUniqueOrThrow({ where: { id: c.id } });
    expect(stored).toMatchObject({ industry: null, aliases: null, businessNo: "1208824298" });
    expect(refreshSourcesFor).not.toHaveBeenCalled();
  });

  test("surfaces repository errors — a name clash and a short number", async () => {
    await prisma.company.create({ data: { name: "㈜나", year: 2026 } });
    const c = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    expect(await editCompanyAction({ companyId: c.id, name: "㈜나", industry: "", businessNo: "", aliases: [] })).toEqual({ ok: false, message: "이미 등록된 기업입니다." });
    expect(await editCompanyAction({ companyId: c.id, name: "㈜가", industry: "", businessNo: "123", aliases: [] })).toEqual({ ok: false, message: "사업자번호는 숫자 10자리여야 합니다." });
  });

  test("excludes and restores a company without deleting the row", async () => {
    const c = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    expect(await setCompanyActiveAction({ companyId: c.id, isActive: false })).toEqual({ ok: true });
    expect((await prisma.company.findUniqueOrThrow({ where: { id: c.id } })).isActive).toBe(false);
    expect(await setCompanyActiveAction({ companyId: c.id, isActive: true })).toEqual({ ok: true });
    expect((await prisma.company.findUniqueOrThrow({ where: { id: c.id } })).isActive).toBe(true);
    expect(await setCompanyActiveAction({ companyId: 9999, isActive: false })).toEqual({ ok: false, message: "기업을 찾을 수 없습니다." });
  });
});
