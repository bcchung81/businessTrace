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
    await prisma.analysisRun.create({ data: { companyId: a.id, userId: user.id, model: "m", status: "completed", newsJson: JSON.stringify([{ link: "1" }, { link: "2" }]), duplicatesRemoved: 99, createdAt: new Date("2026-08-01") } });
    await prisma.analysisRun.create({ data: { companyId: a.id, userId: user.id, model: "m", status: "completed", newsJson: JSON.stringify([{ link: "1" }, { link: "2" }, { link: "3" }]), duplicatesRemoved: 5, createdAt: new Date("2026-08-02") } });
    await prisma.analysisRun.create({ data: { companyId: b.id, userId: user.id, model: "m", status: "no_news", newsJson: "[]", duplicatesRemoved: 2, createdAt: new Date("2026-08-02") } });
    expect(await summariseCollection(YEAR)).toEqual({ articles: 3, analysed: 1, noNews: 1, duplicatesRemoved: 7 });
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
    const review = await countReviewCompanies(YEAR);
    expect(review).toMatchObject({ companies: 3, openAlertNotice: 1, needsReview: 0 });
    expect(review.ids.sort()).toEqual([noBizno.id, conflict.id, openAlert.id].sort());
    expect(review.needsReviewIds).toEqual([]);
  });

  test("countReviewCompanies spells out why each company is listed and stacks the open events newest first", async () => {
    const a = await prisma.company.create({ data: { name: "㈜가", year: YEAR, businessNo: null, displayOrder: 0 } });
    const b = await prisma.company.create({ data: { name: "㈜나", year: YEAR, businessNo: "2", displayOrder: 1 } });
    await prisma.sourceSnapshot.create({ data: { companyId: a.id, source: "nps", status: "conflict", payload: "{}" } });
    const older = await prisma.event.create({ data: { companyId: a.id, kind: "closure", severity: "alert", status: "open", occurredAt: new Date("2026-08-01"), title: "폐업 위험", evidenceJson: "[]", evidenceKey: "e1" } });
    const newer = await prisma.event.create({ data: { companyId: b.id, kind: "negative_press", severity: "notice", status: "open", occurredAt: new Date("2026-08-20"), title: "부정 보도", evidenceJson: "[]", evidenceKey: "e2" } });

    const review = await countReviewCompanies(YEAR);

    expect(review.items).toEqual([
      { id: a.id, name: "㈜가", reasons: ["사업자번호 미확보", "동명 충돌 1", "미확인 경보·주의 1"], failed: [] },
      { id: b.id, name: "㈜나", reasons: ["미확인 경보·주의 1"], failed: [] },
    ]);
    expect(review.openEvents).toEqual([
      { id: newer.id, companyId: b.id, companyName: "㈜나", title: "부정 보도", severity: "notice" },
      { id: older.id, companyId: a.id, companyName: "㈜가", title: "폐업 위험", severity: "alert" },
    ]);
  });

  test("countReviewCompanies orders the ids by registration and names the unreviewed ones", async () => {
    const user = await prisma.user.create({ data: { email: "q3@example.com", passwordHash: "x" } });
    const late = await prisma.company.create({ data: { name: "㈜늦게", year: YEAR, displayOrder: 9 } });
    const early = await prisma.company.create({ data: { name: "㈜먼저", year: YEAR, displayOrder: 1 } });
    const unreviewed = await prisma.company.create({ data: { name: "㈜검토", year: YEAR, displayOrder: 5, businessNo: "9" } });
    const run = await prisma.analysisRun.create({ data: { companyId: unreviewed.id, userId: user.id, model: "m", status: "completed", newsJson: "[]" } });
    await prisma.verificationResult.create({ data: { analysisRunId: run.id, status: "needs_review", unsupportedClaims: "[]", counterEvidence: "[]", detailJson: "{}" } });

    const review = await countReviewCompanies(YEAR);

    expect(review.ids).toEqual([early.id, unreviewed.id, late.id]);
    expect(review.needsReviewIds).toEqual([unreviewed.id]);
    expect(review.items.map((item) => item.reasons)).toEqual([["사업자번호 미확보"], ["검토 필요"], ["사업자번호 미확보"]]);
    expect(review.openEvents).toEqual([]);
  });

  test("countReviewCompanies names the gates an unreviewed verdict fell on", async () => {
    const user = await prisma.user.create({ data: { email: "q4@example.com", passwordHash: "x" } });
    const c = await prisma.company.create({ data: { name: "㈜바", year: YEAR, businessNo: "5" } });
    const run = await prisma.analysisRun.create({ data: { companyId: c.id, userId: user.id, model: "m", status: "completed", newsJson: "[]" } });
    await prisma.verificationResult.create({
      data: { analysisRunId: run.id, status: "needs_review", faithfulness: 0.8, sourceCoverage: 1, evidenceMatch: 0.62, unsupportedClaims: "[]", counterEvidence: "[]", detailJson: "{}" },
    });

    const review = await countReviewCompanies(YEAR);

    expect(review.items).toEqual([{ id: c.id, name: "㈜바", reasons: ["검토 필요"], failed: ["근거 충실도"] }]);
  });

  test("countReviewCompanies still sees an unreviewed verdict behind a later news-only run", async () => {
    const user = await prisma.user.create({ data: { email: "q2@example.com", passwordHash: "x" } });
    const c = await prisma.company.create({ data: { name: "㈜마", year: YEAR, businessNo: "4" } });
    const analysed = await prisma.analysisRun.create({
      data: { companyId: c.id, userId: user.id, model: "m", status: "completed", newsJson: "[]", createdAt: new Date("2026-08-01") },
    });
    await prisma.verificationResult.create({
      data: { analysisRunId: analysed.id, status: "needs_review", unsupportedClaims: "[]", counterEvidence: "[]", detailJson: "{}" },
    });
    await prisma.analysisRun.create({
      data: { companyId: c.id, userId: user.id, model: "m", status: "collected", newsJson: "[]", createdAt: new Date("2026-08-20") },
    });

    const review = await countReviewCompanies(YEAR);

    expect(review.needsReview).toBe(1);
    expect(review.ids).toContain(c.id);
    expect(review.needsReviewIds).toEqual([c.id]);
  });
});
