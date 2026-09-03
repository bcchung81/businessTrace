import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import {
  createCompany,
  createCompanies,
  listCompanies,
  listYears,
  updateCompany,
  deactivateCompany,
  listNeighbours,
} from "@/lib/repositories/companyRepository";

describe("createCompany", () => {
  beforeEach(resetDatabase);

  it("registers a company for an evaluation year", async () => {
    const result = await createCompany({ name: "넷록스", year: 2024 });

    expect(result).toMatchObject({ ok: true, company: { name: "넷록스", year: 2024, isActive: true } });
  });

  it("trims the pasted name so stray whitespace does not create a twin", async () => {
    await createCompany({ name: "  넷록스  ", year: 2024 });

    const duplicate = await createCompany({ name: "넷록스", year: 2024 });

    expect(duplicate).toEqual({ ok: false, message: "이미 등록된 기업입니다." });
    expect(await prisma.company.count()).toBe(1);
  });

  it("rejects an empty name", async () => {
    expect(await createCompany({ name: "   ", year: 2024 })).toEqual({
      ok: false,
      message: "기업명을 입력해주세요.",
    });
  });

  it("rejects a business number that is not ten digits", async () => {
    expect(await createCompany({ name: "넷록스", year: 2024, businessNo: "12345" })).toEqual({
      ok: false,
      message: "사업자번호는 숫자 10자리여야 합니다.",
    });
  });

  it("keeps only the digits of a hyphenated business number", async () => {
    const result = await createCompany({ name: "넷록스", year: 2024, businessNo: "120-88-24298" });

    expect(result).toMatchObject({ ok: true, company: { businessNo: "1208824298" } });
  });
});

describe("createCompanies", () => {
  beforeEach(resetDatabase);

  it("registers a pasted list in one go and reports what it skipped", async () => {
    await createCompany({ name: "넷록스", year: 2024 });

    const result = await createCompanies({
      year: 2024,
      entries: [
        { name: "크립토랩", businessNo: "6258700800" },
        { name: "올림플래닛", businessNo: null },
        { name: "넷록스", businessNo: null },
        { name: "페어리", businessNo: "1458102014" },
      ],
    });

    expect(result).toMatchObject({ created: 3, skipped: ["넷록스"] });
    expect(result.createdIds).toHaveLength(3);
    expect(await prisma.company.count()).toBe(4);
    const cryptolab = await prisma.company.findFirst({ where: { name: "크립토랩" } });
    expect(cryptolab?.businessNo).toBe("6258700800");
    const olim = await prisma.company.findFirst({ where: { name: "올림플래닛" } });
    expect(olim?.businessNo).toBeNull();
  });

  it("keeps display order in the order they were pasted", async () => {
    await createCompanies({ year: 2024, entries: [{ name: "크립토랩" }, { name: "올림플래닛" }, { name: "페어리" }] });

    const companies = await listCompanies({ year: 2024 });

    expect(companies.map((c) => c.name)).toEqual(["크립토랩", "올림플래닛", "페어리"]);
  });
});

describe("listCompanies", () => {
  beforeEach(resetDatabase);

  it("returns only the requested year", async () => {
    await createCompany({ name: "넷록스", year: 2024 });
    await createCompany({ name: "넷록스", year: 2025 });

    expect(await listCompanies({ year: 2025 })).toHaveLength(1);
  });

  it("hides deactivated companies unless asked for them", async () => {
    const { company } = (await createCompany({ name: "넷록스", year: 2024 })) as { company: { id: number } };
    await createCompany({ name: "크립토랩", year: 2024 });
    await deactivateCompany(company.id);

    expect(await listCompanies({ year: 2024 })).toHaveLength(1);
    expect(await listCompanies({ year: 2024, includeInactive: true })).toHaveLength(2);
  });
});

describe("listYears", () => {
  beforeEach(resetDatabase);

  it("lists the years that have companies, newest first", async () => {
    await createCompany({ name: "넷록스", year: 2024 });
    await createCompany({ name: "크립토랩", year: 2026 });
    await createCompany({ name: "페어리", year: 2025 });

    expect(await listYears()).toEqual([2026, 2025, 2024]);
  });
});

describe("updateCompany", () => {
  beforeEach(resetDatabase);

  it("fills in the business number DART lookup found later", async () => {
    const { company } = (await createCompany({ name: "올림플래닛", year: 2024 })) as { company: { id: number } };

    const result = await updateCompany(company.id, { businessNo: "1208824298", industry: "ICT" });

    expect(result).toMatchObject({ ok: true, company: { businessNo: "1208824298", industry: "ICT" } });
  });

  it("refuses a rename that collides with another company in the same year", async () => {
    await createCompany({ name: "넷록스", year: 2024 });
    const { company } = (await createCompany({ name: "크립토랩", year: 2024 })) as { company: { id: number } };

    expect(await updateCompany(company.id, { name: "넷록스" })).toEqual({
      ok: false,
      message: "이미 등록된 기업입니다.",
    });
  });
});

describe("deactivateCompany", () => {
  beforeEach(resetDatabase);

  it("keeps the row so past analysis runs still resolve their company", async () => {
    const { company } = (await createCompany({ name: "넷록스", year: 2024 })) as { company: { id: number } };
    const user = await prisma.user.create({
      data: { email: "admin@kca.kr", passwordHash: "scrypt:32768:8:1$s$h" },
    });
    await prisma.analysisRun.create({
      data: { companyId: company.id, userId: user.id, model: "claude-sonnet-5", newsJson: "[]" },
    });

    await deactivateCompany(company.id);

    const stored = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(stored.isActive).toBe(false);
    expect(await prisma.analysisRun.count()).toBe(1);
  });
});

describe("listNeighbours", () => {
  beforeEach(resetDatabase);
  it("walks the active companies of the same year in display order", async () => {
    const a = await prisma.company.create({ data: { name: "가", year: 2026, displayOrder: 0 } });
    const b = await prisma.company.create({ data: { name: "나", year: 2026, displayOrder: 1, isActive: false } });
    const c = await prisma.company.create({ data: { name: "다", year: 2026, displayOrder: 2 } });
    await prisma.company.create({ data: { name: "라", year: 2025, displayOrder: 3 } });
    expect(await listNeighbours(a.id)).toEqual({ prev: null, next: { id: c.id, name: "다" }, position: 1, total: 2 });
    expect(await listNeighbours(c.id)).toEqual({ prev: { id: a.id, name: "가" }, next: null, position: 2, total: 2 });
    expect(await listNeighbours(b.id)).toEqual({ prev: { id: a.id, name: "가" }, next: { id: c.id, name: "다" }, position: 2, total: 3 });
  });

  it("walks only the given queue when one is passed, in the queue's own order", async () => {
    const a = await prisma.company.create({ data: { name: "가", year: 2026, displayOrder: 0 } });
    await prisma.company.create({ data: { name: "나", year: 2026, displayOrder: 1 } });
    const c = await prisma.company.create({ data: { name: "다", year: 2026, displayOrder: 2 } });
    await prisma.company.create({ data: { name: "라", year: 2026, displayOrder: 3 } });

    expect(await listNeighbours(c.id, [a.id, c.id])).toEqual({ prev: { id: a.id, name: "가" }, next: null, position: 2, total: 2 });
    expect(await listNeighbours(a.id, [a.id, c.id])).toEqual({ prev: null, next: { id: c.id, name: "다" }, position: 1, total: 2 });
  });

  it("points a company that just left the queue at the next one still in it", async () => {
    const a = await prisma.company.create({ data: { name: "가", year: 2026, displayOrder: 0 } });
    const b = await prisma.company.create({ data: { name: "나", year: 2026, displayOrder: 1 } });
    const c = await prisma.company.create({ data: { name: "다", year: 2026, displayOrder: 2 } });

    expect(await listNeighbours(b.id, [a.id, c.id])).toEqual({ prev: null, next: { id: a.id, name: "가" }, position: null, total: 2 });
    expect(await listNeighbours(b.id, [])).toEqual({ prev: null, next: null, position: null, total: 0 });
  });
});
