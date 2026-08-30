import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { countReviewCompanies, fullSourceRefreshAt, summariseCells, summariseCollection } from "@/lib/repositories/pipelineRepo";

const YEAR = 2026;

describe("pipelineRepo", () => {
  beforeEach(resetDatabase);

  test("summariseCollection counts articles across each company's latest run and no-news runs", async () => {
    const user = await prisma.user.create({ data: { email: "p@example.com", passwordHash: "x" } });
    const a = await prisma.company.create({ data: { name: "㈜가", year: YEAR } });
    const b = await prisma.company.create({ data: { name: "㈜나", year: YEAR } });
    await prisma.analysisRun.create({ data: { companyId: a.id, userId: user.id, model: "m", status: "completed", newsJson: JSON.stringify([{ link: "1" }, { link: "2" }]), createdAt: new Date("2026-08-01") } });
    await prisma.analysisRun.create({ data: { companyId: a.id, userId: user.id, model: "m", status: "completed", newsJson: JSON.stringify([{ link: "1" }, { link: "2" }, { link: "3" }]), createdAt: new Date("2026-08-02") } });
    await prisma.analysisRun.create({ data: { companyId: b.id, userId: user.id, model: "m", status: "no_news", newsJson: "[]", createdAt: new Date("2026-08-02") } });
    expect(await summariseCollection(YEAR)).toEqual({ articles: 3, analysed: 1, noNews: 1 });
  });

  test("summariseCells counts snapshot states and fullSourceRefreshAt finds the last day every company was refreshed", async () => {
    const a = await prisma.company.create({ data: { name: "㈜가", year: YEAR } });
    const b = await prisma.company.create({ data: { name: "㈜나", year: YEAR } });
    const day = (d: string, h = 1) => new Date(`${d}T0${h}:00:00.000Z`);
    for (const [c, source, status, at] of [
      [a, "dart", "found", day("2026-08-28")], [a, "nps", "conflict", day("2026-08-28")], [a, "fsc", "pending", day("2026-08-30")],
      [b, "dart", "absent", day("2026-08-28")], [b, "nps", "unmeasurable", day("2026-08-28")],
    ] as const) {
      await prisma.sourceSnapshot.create({ data: { companyId: c.id, source, status, payload: "{}", fetchedAt: at } });
    }
    expect(await summariseCells(YEAR)).toEqual({ found: 1, conflict: 1, pending: 1, absent: 1, unmeasurable: 1 });
    expect((await fullSourceRefreshAt(YEAR))?.slice(0, 10)).toBe("2026-08-28");
  });

  test("countReviewCompanies counts companies with anything a person must settle", async () => {
    const user = await prisma.user.create({ data: { email: "q@example.com", passwordHash: "x" } });
    const noBizno = await prisma.company.create({ data: { name: "㈜가", year: YEAR, businessNo: null } });
    const conflict = await prisma.company.create({ data: { name: "㈜나", year: YEAR, businessNo: "1" } });
    const openAlert = await prisma.company.create({ data: { name: "㈜다", year: YEAR, businessNo: "2" } });
    const clean = await prisma.company.create({ data: { name: "㈜라", year: YEAR, businessNo: "3" } });
    await prisma.sourceSnapshot.create({ data: { companyId: conflict.id, source: "nps", status: "conflict", payload: "{}" } });
    await prisma.event.create({ data: { companyId: openAlert.id, kind: "closure", severity: "alert", status: "open", occurredAt: new Date(), title: "t", evidenceJson: "[]", evidenceKey: "1" } });
    await prisma.event.create({ data: { companyId: clean.id, kind: "award", severity: "positive", status: "open", occurredAt: new Date(), title: "t", evidenceJson: "[]", evidenceKey: "2" } });
    const run = await prisma.analysisRun.create({ data: { companyId: clean.id, userId: user.id, model: "m", status: "completed", newsJson: "[]" } });
    await prisma.verificationResult.create({ data: { analysisRunId: run.id, status: "verified", unsupportedClaims: "[]", counterEvidence: "[]", detailJson: "{}" } });
    expect(await countReviewCompanies(YEAR)).toEqual({ companies: 3, openAlertNotice: 1, needsReview: 0 });
    expect(noBizno.id).toBeGreaterThan(0);
  });
});
