import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { listCompanyPipeline, splitSummary } from "@/lib/repositories/companyPipeline";
import { saveSourceSnapshots } from "@/lib/repositories/sourceSnapshot";

async function seedUser() {
  return prisma.user.create({
    data: { email: "grid@example.com", passwordHash: "scrypt:32768:8:1$s$h" },
  });
}

describe("splitSummary", () => {
  it("takes the part before the separator as the value", () => {
    expect(splitSummary("계속사업자 · 부가가치세 일반과세자")).toEqual({
      value: "계속사업자",
      note: "부가가치세 일반과세자",
    });
  });

  it("keeps everything after the first separator as the note", () => {
    expect(splitSummary("가입자 61명 · 625870 · 12개월")).toEqual({
      value: "가입자 61명",
      note: "625870 · 12개월",
    });
  });

  it("leaves a single phrase as the value with no note", () => {
    expect(splitSummary("DART 에 등록되지 않은 기업")).toEqual({
      value: "DART 에 등록되지 않은 기업",
      note: "",
    });
  });

  it("returns nothing for an empty summary", () => {
    expect(splitSummary("")).toEqual({ value: "", note: "" });
  });
});

describe("listCompanyPipeline", () => {
  beforeEach(resetDatabase);

  it("carries the value each source returned, not just whether it answered", async () => {
    const company = await prisma.company.create({ data: { name: "크립토랩", year: 2025 } });
    await saveSourceSnapshots(company.id, [
      { source: "nts", status: "found", summary: "계속사업자 · 부가가치세 일반과세자", payload: {} },
      { source: "nps", status: "found", summary: "가입자 61명 · 625870", payload: {} },
    ]);

    const [row] = await listCompanyPipeline(2025);

    expect(row.cells.nts).toMatchObject({ state: "ok", value: "계속사업자", note: "부가가치세 일반과세자" });
    expect(row.cells.nps).toMatchObject({ state: "ok", value: "가입자 61명" });
  });

  it("keeps the reason a source came back empty, so the blank explains itself", async () => {
    const company = await prisma.company.create({ data: { name: "가", year: 2025 } });
    await saveSourceSnapshots(company.id, [
      { source: "dart", status: "absent", summary: "DART 에 등록되지 않은 기업", payload: {} },
    ]);

    const [row] = await listCompanyPipeline(2025);

    expect(row.cells.dart).toMatchObject({ state: "absent", value: "DART 에 등록되지 않은 기업" });
  });

  it("counts the articles the collection actually stored", async () => {
    const company = await prisma.company.create({ data: { name: "가", year: 2025 } });
    const user = await seedUser();
    await prisma.analysisRun.create({
      data: {
        companyId: company.id,
        userId: user.id,
        model: "none",
        status: "collected",
        newsJson: JSON.stringify([{ title: "가" }, { title: "나" }, { title: "다" }]),
      },
    });

    const [row] = await listCompanyPipeline(2025);

    expect(row.cells.news).toMatchObject({ state: "ok", value: "3건" });
  });

  it("shows the verification verdict rather than a tick", async () => {
    const company = await prisma.company.create({ data: { name: "가", year: 2025 } });
    const user = await seedUser();
    const run = await prisma.analysisRun.create({
      data: { companyId: company.id, userId: user.id, model: "m", status: "completed", newsJson: "[]" },
    });
    await prisma.verificationResult.create({
      data: {
        analysisRunId: run.id,
        status: "needs_review",
        unsupportedClaims: "[]",
        counterEvidence: "[]",
        detailJson: "{}",
      },
    });

    const [row] = await listCompanyPipeline(2025);

    expect(row.cells.verify).toMatchObject({ state: "conflict", value: "검토 필요" });
    expect(row.cells.llm).toMatchObject({ state: "ok", value: "완료" });
  });

  it("leaves a stage nobody ran as pending with nothing to show", async () => {
    await prisma.company.create({ data: { name: "가", year: 2025 } });

    const [row] = await listCompanyPipeline(2025);

    expect(row.cells.venture).toMatchObject({ state: "pending", value: "" });
    expect(row.cells.news).toMatchObject({ state: "pending", value: "" });
  });

  it("keeps the registration order of the selection sheet", async () => {
    await prisma.company.create({ data: { name: "나중", year: 2025, displayOrder: 1 } });
    await prisma.company.create({ data: { name: "먼저", year: 2025, displayOrder: 0 } });

    expect((await listCompanyPipeline(2025)).map((row) => row.name)).toEqual(["먼저", "나중"]);
  });

  it("carries the business number so the grid can warn when it is missing", async () => {
    await prisma.company.create({ data: { name: "크립토랩", year: 2025, businessNo: "1198701587" } });
    await prisma.company.create({ data: { name: "아크릴", year: 2025 } });

    const rows = await listCompanyPipeline(2025);

    expect(rows.find((row) => row.name === "크립토랩")?.businessNo).toBe("1198701587");
    expect(rows.find((row) => row.name === "아크릴")?.businessNo).toBeNull();
  });

  it("leaves out another evaluation year", async () => {
    await prisma.company.create({ data: { name: "작년", year: 2024 } });

    expect(await listCompanyPipeline(2025)).toEqual([]);
  });
});
