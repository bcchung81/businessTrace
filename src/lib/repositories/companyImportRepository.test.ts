import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { importCompanies } from "@/lib/repositories/companyImportRepository";
import type { ImportedCompany } from "@/lib/services/companyImport";

function imported(over: Partial<ImportedCompany> = {}): ImportedCompany {
  return {
    name: "동아사이언스",
    officialName: "㈜동아사이언스",
    year: 2025,
    businessNo: "1018162201",
    industry: "교육",
    sector: "AI테크",
    ceoName: "장경애",
    ...over,
  };
}

describe("importCompanies", () => {
  beforeEach(resetDatabase);

  it("registers a company with the fields the selection sheet carries", async () => {
    const result = await importCompanies([imported()]);

    expect(result).toMatchObject({ created: 1, updated: 0 });
    const company = await prisma.company.findFirstOrThrow();
    expect(company).toMatchObject({
      name: "동아사이언스",
      officialName: "㈜동아사이언스",
      businessNo: "1018162201",
      industry: "교육",
      sector: "AI테크",
      ceoName: "장경애",
      year: 2025,
    });
  });

  it("updates a company that is already registered instead of failing the whole import", async () => {
    await importCompanies([imported()]);

    const result = await importCompanies([imported({ ceoName: "새대표", industry: "데이터" })]);

    expect(result).toMatchObject({ created: 0, updated: 1 });
    const company = await prisma.company.findFirstOrThrow();
    expect(company).toMatchObject({ ceoName: "새대표", industry: "데이터" });
    expect(await prisma.company.count()).toBe(1);
  });

  it("numbers the companies in sheet order so the screens keep that order", async () => {
    await importCompanies([
      imported({ name: "첫번째", businessNo: "1111111111" }),
      imported({ name: "두번째", businessNo: "2222222222" }),
    ]);

    const companies = await prisma.company.findMany({ orderBy: { displayOrder: "asc" } });
    expect(companies.map((company) => company.name)).toEqual(["첫번째", "두번째"]);
  });

  it("does not renumber companies that were already there", async () => {
    await importCompanies([imported({ name: "첫번째", businessNo: "1111111111" })]);
    await importCompanies([
      imported({ name: "첫번째", businessNo: "1111111111" }),
      imported({ name: "두번째", businessNo: "2222222222" }),
    ]);

    const companies = await prisma.company.findMany({ orderBy: { displayOrder: "asc" } });
    expect(companies.map((company) => company.displayOrder)).toEqual([0, 1]);
  });
});
