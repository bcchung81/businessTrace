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

describe("listBenchmarkInputs — 성장 신호", () => {
  beforeEach(resetDatabase);

  const snapshot = (companyId: number, source: string, payload: unknown) =>
    prisma.sourceSnapshot.create({
      data: { companyId, source, status: "found", summary: source, payload: JSON.stringify(payload), fetchedAt: new Date("2026-08-01") },
    });

  test("매출 증가율을 DART 재무의 전년 대비로 낸다", async () => {
    const company = await prisma.company.create({ data: { name: "㈜가", year: YEAR } });
    await snapshot(company.id, "dartFinance", { revenue: 1400, previous: { revenue: 1000 } });

    const [row] = await listBenchmarkInputs(YEAR);
    expect(row.growth.revenue).toBe(0.4);
  });

  test("전년 매출이 없으면 결측이다 — 0 이 아니다", async () => {
    const company = await prisma.company.create({ data: { name: "㈜가", year: YEAR } });
    await snapshot(company.id, "dartFinance", { revenue: 1400 });

    const [row] = await listBenchmarkInputs(YEAR);
    expect(row.growth.revenue).toBeNull();
  });

  test("고용 증감을 국민연금 12개월 추이로 낸다", async () => {
    const company = await prisma.company.create({ data: { name: "㈜가", year: YEAR } });
    for (const [ym, subscribers] of [["202508", 50], ["202608", 65]] as const) {
      await prisma.pensionSnapshot.create({ data: { companyId: company.id, ym, subscribers } });
    }

    const [row] = await listBenchmarkInputs(YEAR);
    expect(row.growth.headcount).toBe(0.3);
  });

  test("입·퇴사 순증을 국민연금 월별 흐름으로 낸다", async () => {
    const company = await prisma.company.create({ data: { name: "㈜가", year: YEAR } });
    for (let month = 1; month <= 12; month += 1) {
      await prisma.pensionSnapshot.create({
        data: { companyId: company.id, ym: `2026${String(month).padStart(2, "0")}`, subscribers: 100, hired: 3, departed: 1 },
      });
    }

    const [row] = await listBenchmarkInputs(YEAR);
    expect(row.growth.hiring).toBe(0.24);
  });

  test("조달 수주 추이를 최근 2년 대 직전 2년으로 낸다", async () => {
    const company = await prisma.company.create({ data: { name: "㈜가", year: YEAR } });
    await snapshot(company.id, "procurement", {
      count: 4, total: 500, candidates: 0,
      years: [{ year: 2026, count: 1, total: 100 }, { year: 2025, count: 1, total: 200 }, { year: 2024, count: 1, total: 150 }, { year: 2023, count: 1, total: 50 }],
    });

    const [row] = await listBenchmarkInputs(YEAR, new Date("2026-09-04T00:00:00Z"));
    expect(row.growth.procurement).toBe(0.5);
  });

  test("원천이 하나도 없으면 세 신호가 전부 결측이다", async () => {
    await prisma.company.create({ data: { name: "㈜가", year: YEAR } });

    const [row] = await listBenchmarkInputs(YEAR);
    expect(row.growth).toEqual({ revenue: null, headcount: null, hiring: null, procurement: null });
  });
});

describe("listBenchmarkInputs — 1인당 재무의 재료", () => {
  beforeEach(resetDatabase);

  test("최신 달의 가입자 수를 인원으로 낸다", async () => {
    const company = await prisma.company.create({ data: { name: "㈜가", year: YEAR } });
    for (const [ym, subscribers] of [["202605", 40], ["202607", 52], ["202606", 45]] as const) {
      await prisma.pensionSnapshot.create({ data: { companyId: company.id, ym, subscribers } });
    }

    const [row] = await listBenchmarkInputs(YEAR);
    expect(row.headcount).toBe(52);
  });

  test("조달 수주 합계를 대리지표 재료로 낸다", async () => {
    const company = await prisma.company.create({ data: { name: "㈜가", year: YEAR } });
    await prisma.sourceSnapshot.create({
      data: { companyId: company.id, source: "procurement", status: "found", summary: "낙찰", payload: JSON.stringify({ count: 2, total: 3_000, candidates: 1, years: [] }), fetchedAt: new Date("2026-08-01") },
    });

    const [row] = await listBenchmarkInputs(YEAR);
    expect(row.procurementTotal).toBe(3_000);
  });
});

describe("listBenchmarkInputs — 지속가능성 비율", () => {
  beforeEach(resetDatabase);

  test("DART 재무에서 부채비율·ROE·영업이익률을 낸다", async () => {
    const company = await prisma.company.create({ data: { name: "㈜가", year: YEAR } });
    await prisma.sourceSnapshot.create({
      data: { companyId: company.id, source: "dartFinance", status: "found", summary: "재무", fetchedAt: new Date("2026-08-01"),
        payload: JSON.stringify({ revenue: 1000, operatingIncome: 100, netIncome: 60, totalAssets: 900, totalLiabilities: 300, totalEquity: 600 }) },
    });

    const [row] = await listBenchmarkInputs(YEAR);
    expect(row.stability).toEqual({ debtRatio: 0.5, roe: 0.1, operatingMargin: 0.1 });
  });

  test("자본잠식이면 부채비율·ROE 는 결측이고 영업이익률만 남는다", async () => {
    const company = await prisma.company.create({ data: { name: "㈜가", year: YEAR } });
    await prisma.sourceSnapshot.create({
      data: { companyId: company.id, source: "dartFinance", status: "found", summary: "재무", fetchedAt: new Date("2026-08-01"),
        payload: JSON.stringify({ revenue: 1000, operatingIncome: -50, netIncome: -80, totalAssets: 200, totalLiabilities: 300, totalEquity: -100 }) },
    });

    const [row] = await listBenchmarkInputs(YEAR);
    expect(row.stability).toEqual({ debtRatio: null, roe: null, operatingMargin: -0.05 });
  });

  test("재무가 없으면 셋 다 결측이다", async () => {
    await prisma.company.create({ data: { name: "㈜가", year: YEAR } });

    const [row] = await listBenchmarkInputs(YEAR);
    expect(row.stability).toEqual({ debtRatio: null, roe: null, operatingMargin: null });
  });
});
