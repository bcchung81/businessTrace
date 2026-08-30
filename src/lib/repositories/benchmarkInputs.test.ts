import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { listBenchmarkInputs } from "@/lib/repositories/benchmarkInputs";

const YEAR = 2026;

async function user() {
  return prisma.user.create({ data: { email: `b-${Date.now()}-${Math.random()}@example.com`, passwordHash: "scrypt:32768:8:1$s$h" } });
}

async function completedRun(
  companyId: number,
  userId: number,
  stats: Partial<{ averageSentiment: number; awardCount: number; investmentCount: number }>,
  createdAt: Date,
) {
  return prisma.analysisRun.create({
    data: {
      companyId,
      userId,
      model: "claude-sonnet-5",
      status: "completed",
      createdAt,
      completedAt: createdAt,
      newsJson: "[]",
      resultJson: JSON.stringify({ stats: { averageSentiment: 0, awardCount: 0, investmentCount: 0, ...stats } }),
    },
  });
}

describe("listBenchmarkInputs", () => {
  beforeEach(resetDatabase);

  test("takes sentiment, awards and investments from the latest completed run only", async () => {
    const u = await user();
    const company = await prisma.company.create({ data: { name: "㈜가", year: YEAR, industry: "SW" } });
    await completedRun(company.id, u.id, { averageSentiment: 2, awardCount: 0, investmentCount: 0 }, new Date("2026-07-01"));
    await completedRun(company.id, u.id, { averageSentiment: 6, awardCount: 1, investmentCount: 2 }, new Date("2026-08-01"));

    const [row] = await listBenchmarkInputs(YEAR);
    expect(row).toMatchObject({ companyId: company.id, name: "㈜가", industry: "SW", sentiment: 6, awards: 1, investments: 2 });
  });

  test("leaves every metric null for a company that was never analysed", async () => {
    await prisma.company.create({ data: { name: "㈜나", year: YEAR } });
    const [row] = await listBenchmarkInputs(YEAR);
    expect(row).toMatchObject({ sentiment: null, awards: null, investments: null, revenue: null, verification: null, confirmedRisks: 0 });
  });

  test("reads revenue only from a found dartFinance snapshot", async () => {
    const found = await prisma.company.create({ data: { name: "㈜다", year: YEAR } });
    const absent = await prisma.company.create({ data: { name: "㈜라", year: YEAR } });
    await prisma.sourceSnapshot.create({ data: { companyId: found.id, source: "dartFinance", status: "found", payload: JSON.stringify({ found: true, revenue: 12_000 }) } });
    await prisma.sourceSnapshot.create({ data: { companyId: absent.id, source: "dartFinance", status: "absent", payload: JSON.stringify({ found: false, revenue: null }) } });

    const rows = await listBenchmarkInputs(YEAR);
    expect(rows.find((row) => row.companyId === found.id)?.revenue).toBe(12_000);
    expect(rows.find((row) => row.companyId === absent.id)?.revenue).toBeNull();
  });

  test("counts only confirmed alert events as risks", async () => {
    const company = await prisma.company.create({ data: { name: "㈜마", year: YEAR } });
    const base = { companyId: company.id, kind: "closure", occurredAt: new Date("2026-08-01"), title: "t", evidenceJson: "[]" };
    await prisma.event.create({ data: { ...base, severity: "alert", status: "open", evidenceKey: "1" } });
    await prisma.event.create({ data: { ...base, severity: "alert", status: "acknowledged", evidenceKey: "2" } });
    await prisma.event.create({ data: { ...base, severity: "alert", status: "done", evidenceKey: "3" } });
    await prisma.event.create({ data: { ...base, severity: "notice", status: "done", evidenceKey: "4" } });

    const [row] = await listBenchmarkInputs(YEAR);
    expect(row.confirmedRisks).toBe(2);
  });

  test("skips inactive companies and other years", async () => {
    await prisma.company.create({ data: { name: "㈜바", year: YEAR, isActive: false } });
    await prisma.company.create({ data: { name: "㈜사", year: YEAR - 1 } });
    expect(await listBenchmarkInputs(YEAR)).toEqual([]);
  });
});
