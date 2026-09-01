import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { listAwards, saveAwards } from "@/lib/repositories/procurementAward";
import type { AwardMatch } from "@/lib/services/procurementWins";

async function seedCompany(name: string, year = 2026) {
  return prisma.company.create({ data: { name, year } });
}

function match(companyId: number, overrides: Partial<AwardMatch["award"]> = {}, matchedBy: "bizno" | "name" = "bizno"): AwardMatch {
  return {
    companyId,
    matchedBy,
    award: {
      awardKey: "R26BK01550761-000-1-000",
      bidNoticeNo: "R26BK01550761",
      category: "물품",
      title: "상용SW 제3자단가계약",
      winnerName: "옥타코 주식회사",
      winnerBusinessNo: "2698100419",
      amount: 49500000,
      awardedAt: "2026-06-09",
      agency: "각 수요기관",
      ...overrides,
    },
  };
}

describe("saveAwards", () => {
  beforeEach(resetDatabase);

  it("stores a matched award against its company", async () => {
    const company = await seedCompany("옥타코");

    const saved = await saveAwards([match(company.id)]);

    expect(saved).toBe(1);
    const rows = await prisma.procurementAward.findMany();
    expect(rows[0]).toMatchObject({
      companyId: company.id,
      awardKey: "R26BK01550761-000-1-000",
      category: "물품",
      amount: 49500000,
      awardedAt: "2026-06-09",
      matchedBy: "bizno",
      agency: "각 수요기관",
    });
  });

  it("re-collecting the same award updates it instead of stacking a duplicate", async () => {
    const company = await seedCompany("옥타코");

    await saveAwards([match(company.id)]);
    await saveAwards([match(company.id, { amount: 51000000 })]);

    const rows = await prisma.procurementAward.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(51000000);
  });
});

describe("listAwards", () => {
  beforeEach(resetDatabase);

  it("returns a company's awards newest first", async () => {
    const company = await seedCompany("옥타코");
    await saveAwards([
      match(company.id, { awardKey: "old", awardedAt: "2025-11-20" }),
      match(company.id, { awardKey: "new", awardedAt: "2026-06-09" }),
    ]);

    const rows = await listAwards(company.id);

    expect(rows.map((row) => row.awardKey)).toEqual(["new", "old"]);
  });

  it("keeps another company's awards out", async () => {
    const ours = await seedCompany("옥타코");
    const theirs = await seedCompany("크립토랩");
    await saveAwards([match(theirs.id)]);

    expect(await listAwards(ours.id)).toEqual([]);
  });
});
