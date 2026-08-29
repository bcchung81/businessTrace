import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { listPensionSeries, savePensionSeries } from "@/lib/repositories/pensionSnapshot";

async function seedCompany(name: string, year = 2026) {
  return prisma.company.create({ data: { name, year } });
}

describe("savePensionSeries", () => {
  beforeEach(resetDatabase);

  it("stores a month series for a company", async () => {
    const company = await seedCompany("크립토랩");

    await savePensionSeries(company.id, {
      businessNoPrefix: "625870",
      months: [
        { ym: "202606", subscribers: 54, noticeAmount: 23000000, hired: 2, departed: 0 },
        { ym: "202607", subscribers: 61, noticeAmount: 27000180, hired: 7, departed: 2 },
      ],
    });

    const rows = await prisma.pensionSnapshot.findMany({ orderBy: { ym: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ ym: "202607", subscribers: 61, noticeAmount: 27000180 });
  });

  it("updates the same month instead of stacking duplicates", async () => {
    const company = await seedCompany("크립토랩");
    const month = { ym: "202607", subscribers: 61, noticeAmount: 27000180, hired: 7, departed: 2 };

    await savePensionSeries(company.id, { businessNoPrefix: "625870", months: [month] });
    await savePensionSeries(company.id, {
      businessNoPrefix: "625870",
      months: [{ ...month, subscribers: 62 }],
    });

    const rows = await prisma.pensionSnapshot.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].subscribers).toBe(62);
  });

  it("keeps a missing headcount null rather than writing zero", async () => {
    const company = await seedCompany("페어리");

    await savePensionSeries(company.id, {
      months: [{ ym: "202607", subscribers: null, noticeAmount: null, hired: null, departed: null }],
    });

    const row = await prisma.pensionSnapshot.findFirstOrThrow();
    expect(row.subscribers).toBeNull();
    expect(row.noticeAmount).toBeNull();
  });
});

describe("listPensionSeries", () => {
  beforeEach(resetDatabase);

  it("returns each company of the year with its months in order", async () => {
    const crypto = await seedCompany("크립토랩");
    const olim = await seedCompany("올림플래닛");
    await seedCompany("작년기업", 2025);

    await savePensionSeries(crypto.id, {
      months: [
        { ym: "202607", subscribers: 61, noticeAmount: 27000180, hired: 7, departed: 2 },
        { ym: "202606", subscribers: 54, noticeAmount: 23000000, hired: 2, departed: 0 },
      ],
    });
    await savePensionSeries(olim.id, {
      months: [{ ym: "202607", subscribers: 32, noticeAmount: 13756720, hired: 0, departed: 1 }],
    });

    const series = await listPensionSeries(2026);

    expect(series.map((entry) => entry.name)).toEqual(["크립토랩", "올림플래닛"]);
    expect(series[0].points.map((point) => point.ym)).toEqual(["202606", "202607"]);
  });

  it("includes a company that has no pension data at all", async () => {
    await seedCompany("넷록스");

    const series = await listPensionSeries(2026);

    expect(series).toHaveLength(1);
    expect(series[0].points).toEqual([]);
  });
});
